from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_login import LoginManager, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import requests
import os
import secrets
import hmac
import time
import threading
from collections import defaultdict, deque

# 初始化 Flask
app = Flask(__name__)

# ============ 配置部分 ============
def env_flag(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in ('1', 'true', 'yes', 'on')


secret_key = os.environ.get('SECRET_KEY')
if not secret_key:
    secret_key = secrets.token_urlsafe(64)
    print("⚠️ 未设置 SECRET_KEY，已使用进程内随机密钥（重启后会失效）")

app.config['SECRET_KEY'] = secret_key
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'  # 关键配置！
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['OLLAMA_BASE_URL'] = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
app.config['DEFAULT_MODEL'] = os.environ.get('DEFAULT_MODEL', 'qwen3:14b')
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_CONTENT_LENGTH', '1048576'))  # 1MB
app.config['MAX_QUESTION_CHARS'] = int(os.environ.get('MAX_QUESTION_CHARS', '8000'))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
app.config['SESSION_COOKIE_SECURE'] = env_flag('SESSION_COOKIE_SECURE', False)
app.config['REMEMBER_COOKIE_HTTPONLY'] = True
app.config['REMEMBER_COOKIE_SAMESITE'] = os.environ.get('REMEMBER_COOKIE_SAMESITE', 'Lax')
app.config['REMEMBER_COOKIE_SECURE'] = env_flag('REMEMBER_COOKIE_SECURE', app.config['SESSION_COOKIE_SECURE'])


class InMemoryRateLimiter:
    def __init__(self):
        self._events = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key, limit, window_seconds):
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                return False, retry_after
            bucket.append(now)
        return True, 0


rate_limiter = InMemoryRateLimiter()

# ============ 初始化扩展 ============
db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = '请先登录'

# ============ 数据库模型 ============
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)
    
    chats = db.relationship('ChatHistory', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def change_password(self, old_password, new_password):
        if self.check_password(old_password):
            self.set_password(new_password)
            db.session.commit()
            return True
        return False
    
    def update_last_login(self):
        self.last_login = datetime.utcnow()
        db.session.commit()
    
    @property
    def is_authenticated(self):
        return True
    
    @property
    def is_anonymous(self):
        return False
    
    def get_id(self):
        return str(self.id)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None,
            'last_login': self.last_login.strftime('%Y-%m-%d %H:%M:%S') if self.last_login else None
        }

class ChatHistory(db.Model):
    __tablename__ = 'chat_history'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    model = db.Column(db.String(100), default='qwen3:14b')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    tokens_used = db.Column(db.Integer, default=0)
    
    def to_dict(self):
        return {
            'id': self.id,
            'question': self.question,
            'answer': self.answer,
            'model': self.model,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'tokens_used': self.tokens_used
        }

class SystemConfig(db.Model):
    __tablename__ = 'system_config'
    
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    value = db.Column(db.Text)
    description = db.Column(db.String(200))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ============ 用户加载器 ============
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


def get_csrf_token():
    token = session.get('csrf_token')
    if not token:
        token = secrets.token_urlsafe(32)
        session['csrf_token'] = token
    return token


def get_client_ip():
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'


def enforce_rate_limit(scope, identity, limit, window_seconds=60):
    key = f"{scope}:{identity}"
    allowed, retry_after = rate_limiter.allow(key, limit, window_seconds)
    if allowed:
        return None
    response = jsonify({'success': False, 'message': '请求过于频繁，请稍后再试'})
    response.status_code = 429
    response.headers['Retry-After'] = str(retry_after)
    return response


@app.before_request
def csrf_protect():
    if request.method not in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        return None

    # 仅对已登录会话强制校验，避免破坏登录/注册流程
    if not current_user.is_authenticated:
        return None

    provided_token = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token')
    expected_token = session.get('csrf_token')

    if not expected_token or not provided_token or not hmac.compare_digest(provided_token, expected_token):
        return jsonify({'success': False, 'message': 'CSRF token 校验失败'}), 403

    return None


@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


@app.errorhandler(413)
def payload_too_large(_):
    return jsonify({'success': False, 'message': '请求体过大'}), 413

# ============ 数据库初始化 ============
def init_db():
    """初始化数据库"""
    with app.app_context():
        # 创建所有表
        db.create_all()
        print("✓ 数据库表创建成功")
        
        # 检查是否需要初始化管理员
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin_init_password = os.environ.get('ADMIN_INIT_PASSWORD')
            if admin_init_password:
                admin = User(
                    username='admin',
                    created_at=datetime.utcnow(),
                    is_active=True
                )
                admin.set_password(admin_init_password)
                db.session.add(admin)
                print("✓ 管理员用户已创建 (admin)")
            else:
                print("⚠️ 未设置 ADMIN_INIT_PASSWORD，已跳过默认管理员创建")
        else:
            print("✓ 管理员用户已存在")
        
        # 初始化系统配置
        configs = {
            'default_model': app.config['DEFAULT_MODEL'],
            'max_history_per_user': '100',
            'ollama_base_url': app.config['OLLAMA_BASE_URL'],
            'system_version': '2.0.0'
        }
        
        for key, value in configs.items():
            config = SystemConfig.query.filter_by(key=key).first()
            if not config:
                config = SystemConfig(
                    key=key,
                    value=value,
                    description=f'系统配置: {key}',
                    updated_at=datetime.utcnow()
                )
                db.session.add(config)
        
        db.session.commit()
        print("✓ 系统配置初始化完成")

# 执行数据库初始化
init_db()

# ============ Ollama API调用 ============
def query_ollama(prompt, model=None):
    try:
        model = model or app.config['DEFAULT_MODEL']
        url = f"{app.config['OLLAMA_BASE_URL']}/api/generate"
        
        response = requests.post(url, json={
            "model": model,
            "prompt": prompt,
            "stream": False
        }, timeout=300)
        
        response.raise_for_status()
        result = response.json()
        
        return {
            "response": result.get("response", ""),
            "eval_count": result.get("eval_count", 0)
        }
    except requests.exceptions.ConnectionError:
        return {"error": "无法连接到Ollama服务，请确保Ollama已启动"}
    except Exception:
        app.logger.exception('Ollama API调用异常')
        return {"error": "Ollama服务调用失败，请稍后重试"}

# ============ 路由 ============
@app.route('/')
def index():
    if not current_user.is_authenticated:
        return redirect(url_for('login'))
    return render_template('index.html', csrf_token=get_csrf_token())

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'GET':
        return render_template('login.html')
    
    try:
        ip = get_client_ip()
        limit_response = enforce_rate_limit('login_ip', ip, limit=12, window_seconds=60)
        if limit_response:
            return limit_response

        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({'success': False, 'message': '用户名和密码不能为空'})
        
        if len(username) > 80 or len(password) > 256:
            return jsonify({'success': False, 'message': '输入长度超出限制'})
        
        limit_response = enforce_rate_limit('login_user', f"{ip}:{username.lower()}", limit=6, window_seconds=60)
        if limit_response:
            return limit_response
        
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            user.update_last_login()
            login_user(user, remember=True)
            return jsonify({'success': True, 'redirect': url_for('index')})
        else:
            return jsonify({'success': False, 'message': '用户名或密码错误'})
    except Exception:
        app.logger.exception('登录处理异常')
        return jsonify({'success': False, 'message': '登录失败，请稍后重试'})

@app.route('/register', methods=['POST'])
def register():
    try:
        ip = get_client_ip()
        limit_response = enforce_rate_limit('register_ip', ip, limit=5, window_seconds=300)
        if limit_response:
            return limit_response

        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({'success': False, 'message': '用户名和密码不能为空'})
        
        if len(username) < 3:
            return jsonify({'success': False, 'message': '用户名至少3个字符'})
        
        if len(password) < 6:
            return jsonify({'success': False, 'message': '密码至少6个字符'})
        
        if len(username) > 80 or len(password) > 256:
            return jsonify({'success': False, 'message': '输入长度超出限制'})
        
        if User.query.filter_by(username=username).first():
            return jsonify({'success': False, 'message': '用户名已存在'})
        
        user = User(username=username, created_at=datetime.utcnow(), is_active=True)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        return jsonify({'success': True, 'message': '注册成功，请登录'})
    except Exception:
        app.logger.exception('注册处理异常')
        return jsonify({'success': False, 'message': '注册失败，请稍后重试'})

@app.route('/change-password', methods=['POST'])
@login_required
def change_password():
    try:
        limit_response = enforce_rate_limit(
            'change_password',
            f"{current_user.id}:{get_client_ip()}",
            limit=8,
            window_seconds=300
        )
        if limit_response:
            return limit_response

        data = request.get_json(silent=True) or {}
        old_password = data.get('old_password', '').strip()
        new_password = data.get('new_password', '').strip()
        
        if not old_password or not new_password:
            return jsonify({'success': False, 'message': '密码不能为空'})
        
        if len(new_password) < 6:
            return jsonify({'success': False, 'message': '新密码至少6个字符'})
        
        if current_user.change_password(old_password, new_password):
            return jsonify({'success': True, 'message': '密码修改成功'})
        else:
            return jsonify({'success': False, 'message': '原密码错误'})
    except Exception:
        app.logger.exception('修改密码异常')
        return jsonify({'success': False, 'message': '密码修改失败，请稍后重试'})

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    session.pop('csrf_token', None)
    return jsonify({'success': True, 'redirect': url_for('login')})

@app.route('/api/user/info')
@login_required
def user_info():
    return jsonify({
        'success': True,
        'user': current_user.to_dict()
    })

@app.route('/api/chat', methods=['POST'])
@login_required
def chat():
    try:
        limit_response = enforce_rate_limit(
            'chat',
            f"{current_user.id}:{get_client_ip()}",
            limit=20,
            window_seconds=60
        )
        if limit_response:
            return limit_response

        data = request.get_json(silent=True) or {}
        if not data:
            return jsonify({'success': False, 'message': '无效的请求数据'})
        
        question = data.get('question', '').strip()
        model = data.get('model') or app.config['DEFAULT_MODEL']
        
        if not question:
            return jsonify({'success': False, 'message': '问题不能为空'})
        
        if len(question) > app.config['MAX_QUESTION_CHARS']:
            return jsonify({'success': False, 'message': f"问题过长，最多 {app.config['MAX_QUESTION_CHARS']} 字符"})
        
        result = query_ollama(question, model)
        
        if 'error' in result:
            return jsonify({'success': False, 'message': result['error']})
        
        chat = ChatHistory(
            user_id=current_user.id,
            question=question,
            answer=result['response'],
            model=model,
            tokens_used=result.get('eval_count', 0)
        )
        db.session.add(chat)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'answer': result['response'],
            'history_id': chat.id,
            'tokens_used': result.get('eval_count', 0)
        })
    except Exception:
        app.logger.exception('聊天处理异常')
        return jsonify({'success': False, 'message': '处理失败，请稍后重试'}), 500

@app.route('/api/history', methods=['GET'])
@login_required
def get_history():
    try:
        search = request.args.get('search', '').strip()
        
        query = ChatHistory.query.filter_by(user_id=current_user.id)
        
        if search:
            query = query.filter(
                (ChatHistory.question.ilike(f'%{search}%')) |
                (ChatHistory.answer.ilike(f'%{search}%'))
            )
        
        history = query.order_by(ChatHistory.created_at.desc()).all()
        
        return jsonify({
            'success': True,
            'history': [item.to_dict() for item in history]
        })
    except Exception:
        app.logger.exception('获取历史记录异常')
        return jsonify({'success': False, 'message': '获取历史记录失败'}), 500

@app.route('/api/history/<int:history_id>', methods=['DELETE'])
@login_required
def delete_history(history_id):
    try:
        chat = ChatHistory.query.filter_by(id=history_id, user_id=current_user.id).first()
        if chat:
            db.session.delete(chat)
            db.session.commit()
            return jsonify({'success': True})
        return jsonify({'success': False, 'message': '记录不存在'}), 404
    except Exception:
        app.logger.exception('删除历史记录异常')
        return jsonify({'success': False, 'message': '删除失败'}), 500

@app.route('/api/clear_history', methods=['DELETE'])
@login_required
def clear_history():
    try:
        ChatHistory.query.filter_by(user_id=current_user.id).delete()
        db.session.commit()
        return jsonify({'success': True})
    except Exception:
        app.logger.exception('清空历史记录异常')
        return jsonify({'success': False, 'message': '清空失败'}), 500

@app.route('/api/models', methods=['GET'])
@login_required
def get_models():
    try:
        response = requests.get(f"{app.config['OLLAMA_BASE_URL']}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            return jsonify({
                'success': True,
                'models': [model['name'] for model in models]
            })
    except:
        pass
    
    return jsonify({
        'success': True,
        'models': [app.config['DEFAULT_MODEL']]
    })

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'authenticated': current_user.is_authenticated,
        'user': current_user.username if current_user.is_authenticated else None
    })

# ============ Gunicorn入口 ============
def create_app():
    return app

# ============ 主程序 ============
if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 Ollama WebUI 启动")
    print("="*50)
    print(f"📁 数据库: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"🌐 Ollama: {app.config['OLLAMA_BASE_URL']}")
    print(f"🤖 默认模型: {app.config['DEFAULT_MODEL']}")
    print(f"🔐 调试模式: {env_flag('FLASK_DEBUG', False)}")
    print("="*50 + "\n")
    app.run(
        host=os.environ.get('FLASK_HOST', '127.0.0.1'),
        port=int(os.environ.get('PORT', '5000')),
        debug=env_flag('FLASK_DEBUG', False)
    )
