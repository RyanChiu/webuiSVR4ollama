from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_from_directory
from flask_login import LoginManager, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import requests
import os
import shutil
import sqlite3
import glob
import secrets
import hmac
import time
import threading
from collections import defaultdict, deque
import markdown
import bleach
from markdown.extensions.codehilite import CodeHiliteExtension
from markdown.extensions.fenced_code import FencedCodeExtension
from markdown.extensions.tables import TableExtension
from markdown.extensions.toc import TocExtension

# 导入数据库模型
from database import db, User, ChatHistory, format_datetime_value

# 初始化 Flask
app = Flask(__name__)

# ============ 配置部分 ============
def env_flag(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in ('1', 'true', 'yes', 'on')

base_dir = os.path.abspath(os.path.dirname(__file__))
default_data_dir = os.path.abspath(os.path.expanduser(os.environ.get('APP_DATA_DIR', os.path.join(base_dir, 'app_data'))))
default_db_path = os.path.join(default_data_dir, 'app.db')
configured_db_path = os.path.expanduser(os.environ.get('APP_DB_PATH', default_db_path))
configured_db_path = os.path.abspath(configured_db_path)
os.makedirs(os.path.dirname(configured_db_path), exist_ok=True)


def resolve_secret_key():
    env_secret = os.environ.get('SECRET_KEY')
    if env_secret:
        return env_secret

    key_file = os.path.abspath(
        os.path.expanduser(
            os.environ.get('APP_SECRET_KEY_FILE', os.path.join(default_data_dir, '.secret_key'))
        )
    )
    os.makedirs(os.path.dirname(key_file), exist_ok=True)

    if os.path.exists(key_file):
        try:
            with open(key_file, 'r', encoding='utf-8') as f:
                existing = f.read().strip()
            if existing:
                return existing
        except Exception:
            app.logger.exception('读取 SECRET_KEY 文件失败: %s', key_file)

    generated = secrets.token_urlsafe(64)
    try:
        with open(key_file, 'x', encoding='utf-8') as f:
            f.write(generated)
        os.chmod(key_file, 0o600)
        print(f"⚠️ 未设置 SECRET_KEY，已生成并保存到: {key_file}")
        return generated
    except FileExistsError:
        try:
            with open(key_file, 'r', encoding='utf-8') as f:
                existing = f.read().strip()
            if existing:
                return existing
        except Exception:
            app.logger.exception('读取已存在的 SECRET_KEY 文件失败: %s', key_file)
    except Exception:
        app.logger.exception('写入 SECRET_KEY 文件失败: %s', key_file)

    print("⚠️ 未设置 SECRET_KEY，已使用进程内随机密钥（重启后可能失效）")
    return generated


secret_key = resolve_secret_key()

def _table_count(db_file, table_name):
    if not os.path.exists(db_file):
        return 0
    conn = None
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,)
        )
        if cursor.fetchone() is None:
            return 0
        cursor.execute(f"SELECT COUNT(1) FROM {table_name}")
        row = cursor.fetchone()
        return int(row[0]) if row else 0
    except Exception:
        return 0
    finally:
        if conn is not None:
            conn.close()


def _db_table_stats(db_file):
    users_count = max(_table_count(db_file, 'users'), _table_count(db_file, 'user'))
    chats_count = _table_count(db_file, 'chat_history')
    return users_count, chats_count


def _db_data_score(db_file):
    users_count, chats_count = _db_table_stats(db_file)
    return users_count + chats_count


def _legacy_db_candidates():
    candidates = [
        os.path.join(base_dir, 'app.db'),
        os.path.join(base_dir, 'instance', 'app.db')
    ]
    backup_candidates = sorted(
        glob.glob(os.path.join(base_dir, 'backups', 'app_*.db')),
        reverse=True
    )
    candidates.extend(backup_candidates)
    unique = []
    seen = set()
    for item in candidates:
        normalized = os.path.abspath(item)
        if normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


legacy_candidates = _legacy_db_candidates()

best_legacy_db = None
best_legacy_users = 0
best_legacy_chats = 0
best_legacy_score = 0
for legacy_db in legacy_candidates:
    if legacy_db == configured_db_path:
        continue
    users_count, chats_count = _db_table_stats(legacy_db)
    score = users_count + chats_count
    if score > best_legacy_score:
        best_legacy_db = legacy_db
        best_legacy_users = users_count
        best_legacy_chats = chats_count
        best_legacy_score = score

# 迁移策略：
# 1) 目标库不存在时，直接复制首个存在且有数据的旧库。
# 2) 目标库已存在但数据更少（尤其聊天记录更少）时，尝试从更完整旧库补迁。
if best_legacy_db and best_legacy_score > 0:
    if not os.path.exists(configured_db_path):
        shutil.copy2(best_legacy_db, configured_db_path)
        print(f"✓ 已迁移数据库到持久目录: {configured_db_path}")
    else:
        current_users, current_chats = _db_table_stats(configured_db_path)
        current_score = current_users + current_chats
        should_replace = (
            current_score == 0 or
            (best_legacy_chats > current_chats and best_legacy_score > current_score)
        )
        if should_replace:
            backup_file = f"{configured_db_path}.pre-legacy-sync.bak"
            if not os.path.exists(backup_file):
                shutil.copy2(configured_db_path, backup_file)
            shutil.copy2(best_legacy_db, configured_db_path)
            print(
                "✓ 已从旧库补迁历史数据: "
                f"{best_legacy_db} -> {configured_db_path} "
                f"(legacy users/chats={best_legacy_users}/{best_legacy_chats}, "
                f"current users/chats={current_users}/{current_chats})"
            )

app.config['SECRET_KEY'] = secret_key
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{configured_db_path}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['OLLAMA_BASE_URL'] = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
app.config['DEFAULT_MODEL'] = os.environ.get('DEFAULT_MODEL', '').strip()
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_CONTENT_LENGTH', '1048576'))  # 1MB
app.config['MAX_QUESTION_CHARS'] = int(os.environ.get('MAX_QUESTION_CHARS', '8000'))
app.config['MAX_PROMPT_CHARS'] = int(os.environ.get('MAX_PROMPT_CHARS', '32000'))
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
db.init_app(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = '请先登录'


@login_manager.unauthorized_handler
def handle_unauthorized():
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'message': '未登录或会话已失效'}), 401
    return redirect(url_for('login'))

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


def get_ollama_base_urls():
    configured = (app.config.get('OLLAMA_BASE_URL') or '').strip()
    candidates = []
    for url in [configured, 'http://127.0.0.1:11434', 'http://localhost:11434']:
        if not url:
            continue
        normalized = url.rstrip('/')
        if normalized not in candidates:
            candidates.append(normalized)
    return candidates


def extract_model_names(payload):
    if not isinstance(payload, dict):
        return []
    models = payload.get('models')
    if not isinstance(models, list):
        return []

    model_names = []
    for model in models:
        if isinstance(model, str):
            model_names.append(model)
            continue
        if not isinstance(model, dict):
            continue
        # Ollama 不同版本可能返回 name 或 model 字段
        name = (model.get('name') or model.get('model') or '').strip()
        if name:
            model_names.append(name)
    return model_names


def safe_requests_get(url, timeout):
    # 忽略环境代理，避免 localhost 请求被 http_proxy/https_proxy 劫持
    with requests.Session() as session:
        session.trust_env = False
        return session.get(url, timeout=timeout)


def safe_requests_post(url, payload, timeout):
    # 忽略环境代理，避免 localhost 请求被 http_proxy/https_proxy 劫持
    with requests.Session() as session:
        session.trust_env = False
        return session.post(url, json=payload, timeout=timeout)


@app.before_request
def csrf_protect():
    if request.method not in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        return None

    # 仅对已登录用户强制校验，避免破坏登录/注册流程
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

# ============ Markdown渲染函数 ============
def render_markdown(text):
    """将Markdown文本渲染为HTML"""
    if not text:
        return ''
    
    # 配置Markdown扩展
    extensions = [
        'markdown.extensions.extra',
        'markdown.extensions.abbr',
        'markdown.extensions.attr_list',
        'markdown.extensions.def_list',
        'markdown.extensions.footnotes',
        'markdown.extensions.tables',
        'markdown.extensions.admonition',
        CodeHiliteExtension(
            css_class='highlight',
            linenums=False,
            guess_lang=True,
            use_pygments=True
        ),
        FencedCodeExtension(),
        TableExtension(),
        TocExtension(toc_depth='2-6')
    ]
    
    # 转换Markdown为HTML
    html = markdown.markdown(text, extensions=extensions)
    
    # 允许的HTML标签和属性
    allowed_tags = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'b', 'strong', 'i', 'em', 'u', 'del',
        'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'blockquote',
        'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'img',
        'div', 'span'
    ]
    
    allowed_attrs = {
        '*': ['class', 'id'],
        'a': ['href', 'title', 'target'],
        'img': ['src', 'alt', 'title'],
        'code': ['class'],
        'pre': ['class']
    }
    
    # 清理HTML，防止XSS攻击
    clean_html = bleach.clean(
        html,
        tags=allowed_tags,
        attributes=allowed_attrs,
        strip=True
    )
    
    return clean_html

# ============ 数据库初始化 ============
def ensure_db_schema_compatibility():
    if not os.path.exists(configured_db_path):
        return

    conn = None
    try:
        conn = sqlite3.connect(configured_db_path)
        cursor = conn.cursor()

        def table_columns(table_name):
            cursor.execute(f"PRAGMA table_info({table_name})")
            return {row[1] for row in cursor.fetchall()}

        def table_exists(table_name):
            cursor.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table_name,)
            )
            return cursor.fetchone() is not None

        def ensure_column(table_name, column_name, ddl):
            if not table_exists(table_name):
                return
            existing = table_columns(table_name)
            if column_name in existing:
                return
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {ddl}")
            print(f"✓ 已补齐字段: {table_name}.{column_name}")

        ensure_column('users', 'created_at', 'created_at DATETIME')
        ensure_column('users', 'last_login', 'last_login DATETIME')
        ensure_column('users', 'is_active', 'is_active BOOLEAN DEFAULT 1')

        ensure_column('chat_history', 'answer_html', "answer_html TEXT DEFAULT ''")
        ensure_column('chat_history', 'model', "model VARCHAR(100) DEFAULT ''")
        ensure_column('chat_history', 'tokens_used', 'tokens_used INTEGER DEFAULT 0')
        ensure_column('chat_history', 'created_at', 'created_at DATETIME')
        ensure_column('chat_history', 'conversation_id', "conversation_id VARCHAR(64) DEFAULT ''")
        ensure_column('chat_history', 'conversation_title', "conversation_title VARCHAR(120) DEFAULT ''")
        ensure_column('chat_history', 'question_html', "question_html TEXT DEFAULT ''")

        conn.commit()
    except Exception:
        app.logger.exception('数据库兼容字段补齐失败')
    finally:
        if conn is not None:
            conn.close()


def init_db():
    """初始化数据库"""
    with app.app_context():
        ensure_db_schema_compatibility()
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
                db.session.commit()
                print("✓ 管理员用户已创建 (admin)")
            else:
                print("⚠️ 未设置 ADMIN_INIT_PASSWORD，已跳过默认管理员创建")
        else:
            print("✓ 管理员用户已存在")

# 执行数据库初始化
init_db()

# ============ Ollama API调用 ============
def query_ollama(prompt, model=None):
    try:
        model = model or app.config['DEFAULT_MODEL']
        if not model:
            return {"error": "未指定模型，请先在Ollama中安装并选择模型"}
        last_error = None
        for base_url in get_ollama_base_urls():
            url = f"{base_url}/api/generate"
            try:
                response = safe_requests_post(url, {
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
            except requests.exceptions.RequestException as exc:
                last_error = exc
                continue
        if last_error:
            app.logger.warning('Ollama generate 调用失败: %s', last_error)
        return {"error": "无法连接到Ollama服务，请确认服务地址与端口"}
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
            user.last_login = datetime.utcnow()
            db.session.commit()
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
        limit_response = enforce_rate_limit('register_ip', get_client_ip(), limit=5, window_seconds=300)
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
        
        if len(old_password) > 256 or len(new_password) > 256:
            return jsonify({'success': False, 'message': '输入长度超出限制'})
        
        if current_user.check_password(old_password):
            current_user.set_password(new_password)
            db.session.commit()
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
    try:
        user_payload = current_user.to_dict()
    except Exception:
        app.logger.exception('用户信息序列化失败，回退基础字段')
        user_payload = {
            'id': current_user.id,
            'username': current_user.username,
            'created_at': str(getattr(current_user, 'created_at', '') or ''),
            'last_login': str(getattr(current_user, 'last_login', '') or '')
        }
    return jsonify({
        'success': True,
        'user': user_payload
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
        prompt = (data.get('prompt') or '').strip()
        model = (data.get('model') or app.config['DEFAULT_MODEL']).strip()
        conversation_id = (data.get('conversation_id') or '').strip()
        
        if not question:
            return jsonify({'success': False, 'message': '问题不能为空'})
        if not model:
            return jsonify({'success': False, 'message': '请先选择模型'})
        
        if len(question) > app.config['MAX_QUESTION_CHARS']:
            return jsonify({'success': False, 'message': f"问题过长，最多 {app.config['MAX_QUESTION_CHARS']} 字符"})
        if not prompt:
            prompt = question
        if len(prompt) > app.config['MAX_PROMPT_CHARS']:
            return jsonify({'success': False, 'message': f"请求上下文过长，最多 {app.config['MAX_PROMPT_CHARS']} 字符"})

        if conversation_id and (len(conversation_id) > 64 or '/' in conversation_id):
            return jsonify({'success': False, 'message': '会话标识无效'})
        if not conversation_id:
            conversation_id = secrets.token_hex(12)

        conversation_title = ''
        if conversation_id.startswith('legacy-'):
            try:
                legacy_id = int(conversation_id.split('-', 1)[1])
                legacy_chat = ChatHistory.query.filter_by(id=legacy_id, user_id=current_user.id).first()
                if legacy_chat:
                    conversation_title = (legacy_chat.conversation_title or '').strip() or (legacy_chat.question or '')[:60]
            except (IndexError, ValueError):
                return jsonify({'success': False, 'message': '会话标识无效'})
        else:
            existing_chat = (
                ChatHistory.query
                .filter_by(user_id=current_user.id, conversation_id=conversation_id)
                .order_by(ChatHistory.created_at.desc())
                .first()
            )
            if existing_chat:
                conversation_title = (existing_chat.conversation_title or '').strip() or (existing_chat.question or '')[:60]

        if not conversation_title:
            conversation_title = question[:60]
        
        result = query_ollama(prompt, model)
        
        if 'error' in result:
            return jsonify({'success': False, 'message': result['error']})
        
        # 渲染Markdown
        raw_answer = result['response']
        html_answer = render_markdown(raw_answer)
        html_question = render_markdown(question)
        
        chat = ChatHistory(
            user_id=current_user.id,
            conversation_id=conversation_id,
            conversation_title=conversation_title,
            question=question,
            question_html=html_question,
            answer=raw_answer,
            answer_html=html_answer,
            model=model,
            tokens_used=result.get('eval_count', 0)
        )
        db.session.add(chat)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'question': question,
            'question_html': html_question,
            'answer': raw_answer,
            'answer_html': html_answer,
            'history_id': chat.id,
            'conversation_id': conversation_id,
            'conversation_title': conversation_title,
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
        summary = request.args.get('summary', '0').strip() in {'1', 'true', 'yes'}
        try:
            limit = int(request.args.get('limit', '300'))
        except ValueError:
            limit = 300
        limit = max(1, min(limit, 1000))
        
        query = ChatHistory.query.filter_by(user_id=current_user.id)
        
        if search:
            query = query.filter(
                (ChatHistory.question.ilike(f'%{search}%')) |
                (ChatHistory.answer.ilike(f'%{search}%'))
            )

        fetch_limit = limit
        if summary:
            fetch_limit = min(max(limit * 20, limit), 5000)

        history = query.order_by(ChatHistory.created_at.desc()).limit(fetch_limit).all()

        def conversation_key(item):
            conv = (item.conversation_id or '').strip()
            return conv if conv else f"legacy-{item.id}"

        history_list = []
        if summary:
            seen = set()
            for item in history:
                try:
                    conv_id = conversation_key(item)
                    if conv_id in seen:
                        continue
                    seen.add(conv_id)
                    history_list.append({
                        'conversation_id': conv_id,
                        'title': (item.conversation_title or '').strip() or (item.question or '')[:60],
                        'question': item.question,
                        'created_at': format_datetime_value(item.created_at),
                        'model': item.model or ''
                    })
                    if len(history_list) >= limit:
                        break
                except Exception:
                    app.logger.exception('历史摘要序列化失败，跳过 id=%s', getattr(item, 'id', None))
                    continue
        else:
            pending_render_updates = False
            for item in history:
                try:
                    history_data = item.to_dict()
                    # 如果没有HTML版本，就染一个
                    if not history_data.get('question_html'):
                        rendered = render_markdown(item.question)
                        history_data['question_html'] = rendered
                        item.question_html = rendered
                        pending_render_updates = True
                    if not history_data.get('answer_html'):
                        rendered = render_markdown(item.answer)
                        history_data['answer_html'] = rendered
                        item.answer_html = rendered
                        pending_render_updates = True
                    history_data['conversation_id'] = conversation_key(item)
                    history_list.append(history_data)
                except Exception:
                    app.logger.exception('历史记录序列化失败，跳过 id=%s', getattr(item, 'id', None))
                    continue

            if pending_render_updates:
                db.session.commit()
        
        return jsonify({
            'success': True,
            'history': history_list
        })
    except Exception:
        app.logger.exception('获取历史记录异常')
        return jsonify({'success': False, 'message': '获取历史记录失败'}), 500

@app.route('/api/history/<int:history_id>', methods=['GET', 'DELETE'])
@login_required
def delete_history(history_id):
    try:
        chat = ChatHistory.query.filter_by(id=history_id, user_id=current_user.id).first()
        if not chat:
            return jsonify({'success': False, 'message': '记录不存在'}), 404

        if request.method == 'GET':
            history_data = chat.to_dict()
            pending_render_updates = False
            if not history_data.get('question_html'):
                rendered = render_markdown(chat.question)
                history_data['question_html'] = rendered
                chat.question_html = rendered
                pending_render_updates = True
            if not history_data.get('answer_html'):
                rendered = render_markdown(chat.answer)
                history_data['answer_html'] = rendered
                chat.answer_html = rendered
                pending_render_updates = True
            if pending_render_updates:
                db.session.commit()
            history_data['conversation_id'] = (chat.conversation_id or '').strip() or f"legacy-{chat.id}"
            history_data['conversation_title'] = (chat.conversation_title or '').strip() or (chat.question or '')[:60]
            return jsonify({'success': True, 'history': history_data})

        db.session.delete(chat)
        db.session.commit()
        return jsonify({'success': True})
    except Exception:
        app.logger.exception('历史记录操作异常')
        if request.method == 'GET':
            return jsonify({'success': False, 'message': '获取记录失败'}), 500
        return jsonify({'success': False, 'message': '删除失败'}), 500


@app.route('/api/conversations/<conversation_id>', methods=['GET', 'DELETE'])
@login_required
def conversation_detail(conversation_id):
    try:
        conversation_id = (conversation_id or '').strip()
        if not conversation_id:
            return jsonify({'success': False, 'message': '会话标识不能为空'}), 400

        query = ChatHistory.query.filter_by(user_id=current_user.id)
        if conversation_id.startswith('legacy-'):
            try:
                legacy_id = int(conversation_id.split('-', 1)[1])
            except (IndexError, ValueError):
                return jsonify({'success': False, 'message': '会话标识无效'}), 400
            query = query.filter_by(id=legacy_id)
        else:
            query = query.filter_by(conversation_id=conversation_id)

        chats = query.order_by(ChatHistory.created_at.asc()).all()
        if not chats:
            return jsonify({'success': False, 'message': '会话不存在'}), 404

        if request.method == 'DELETE':
            for chat in chats:
                db.session.delete(chat)
            db.session.commit()
            return jsonify({'success': True})

        history_list = []
        pending_render_updates = False
        effective_title = ''
        for chat in chats:
            data = chat.to_dict()
            if not data.get('question_html'):
                rendered = render_markdown(chat.question)
                data['question_html'] = rendered
                chat.question_html = rendered
                pending_render_updates = True
            if not data.get('answer_html'):
                rendered = render_markdown(chat.answer)
                data['answer_html'] = rendered
                chat.answer_html = rendered
                pending_render_updates = True
            data['conversation_id'] = (chat.conversation_id or '').strip() or f"legacy-{chat.id}"
            data['conversation_title'] = (chat.conversation_title or '').strip() or (chat.question or '')[:60]
            if not effective_title and data['conversation_title']:
                effective_title = data['conversation_title']
            history_list.append(data)

        if pending_render_updates:
            db.session.commit()

        return jsonify({
            'success': True,
            'conversation_id': conversation_id,
            'conversation_title': effective_title,
            'history': history_list
        })
    except Exception:
        app.logger.exception('会话记录操作异常')
        if request.method == 'DELETE':
            return jsonify({'success': False, 'message': '删除会话失败'}), 500
        return jsonify({'success': False, 'message': '获取会话失败'}), 500


@app.route('/api/conversations/<conversation_id>/title', methods=['PATCH'])
@login_required
def update_conversation_title(conversation_id):
    try:
        conversation_id = (conversation_id or '').strip()
        if not conversation_id:
            return jsonify({'success': False, 'message': '会话标识不能为空'}), 400

        data = request.get_json(silent=True) or {}
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'success': False, 'message': '标题不能为空'}), 400
        if len(title) > 120:
            return jsonify({'success': False, 'message': '标题长度不能超过120字符'}), 400

        query = ChatHistory.query.filter_by(user_id=current_user.id)
        if conversation_id.startswith('legacy-'):
            try:
                legacy_id = int(conversation_id.split('-', 1)[1])
            except (IndexError, ValueError):
                return jsonify({'success': False, 'message': '会话标识无效'}), 400
            query = query.filter_by(id=legacy_id)
        else:
            query = query.filter_by(conversation_id=conversation_id)

        chats = query.all()
        if not chats:
            return jsonify({'success': False, 'message': '会话不存在'}), 404

        for chat in chats:
            chat.conversation_title = title
        db.session.commit()

        return jsonify({
            'success': True,
            'conversation_id': conversation_id,
            'conversation_title': title
        })
    except Exception:
        app.logger.exception('更新会话标题异常')
        return jsonify({'success': False, 'message': '更新会话标题失败'}), 500

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
def get_models():
    """获取可用的模型列表"""
    try:
        last_status = None
        saw_success_response = False
        for base_url in get_ollama_base_urls():
            try:
                response = safe_requests_get(f"{base_url}/api/tags", timeout=5)
                if response.status_code != 200:
                    last_status = response.status_code
                    continue
                saw_success_response = True
                try:
                    data = response.json()
                except ValueError:
                    app.logger.warning('Ollama /api/tags 返回了非 JSON 响应: %s', base_url)
                    continue

                model_names = extract_model_names(data)
                if model_names:
                    print(f"✓ 获取到模型列表: {model_names}")
                    return jsonify({
                        'success': True,
                        'models': model_names
                    })
            except requests.exceptions.RequestException as exc:
                app.logger.warning('Ollama /api/tags 请求失败: %s (%s)', base_url, exc)
                continue
        if last_status:
            app.logger.warning('Ollama /api/tags 返回非200: %s', last_status)
        if saw_success_response:
            app.logger.info('Ollama /api/tags 可访问，但当前无可用模型')
    except Exception:
        app.logger.exception('获取模型列表失败')
    
    # 如果获取失败，回退到配置的默认模型（若有）
    fallback_models = [app.config['DEFAULT_MODEL']] if app.config['DEFAULT_MODEL'] else []
    return jsonify({
        'success': True,
        'models': fallback_models
    })

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'authenticated': current_user.is_authenticated,
        'user': current_user.username if current_user.is_authenticated else None
    })


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(app.static_folder, 'favicon.svg', mimetype='image/svg+xml')

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
    print(f"🤖 默认模型: {app.config['DEFAULT_MODEL'] or '（未设置）'}")
    print(f"🔐 调试模式: {env_flag('FLASK_DEBUG', False)}")
    print("="*50 + "\n")
    app.run(
        host=os.environ.get('FLASK_HOST', '127.0.0.1'),
        port=int(os.environ.get('PORT', '5001')),
        debug=env_flag('FLASK_DEBUG', False)
    )
