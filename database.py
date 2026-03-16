from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()


def format_datetime_value(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        for fmt in (
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%d'
        ):
            try:
                dt = datetime.strptime(text, fmt)
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            except ValueError:
                continue
        return text
    return str(value)

class User(db.Model, UserMixin):
    """用户模型"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)
    
    # 关联关系
    chats = db.relationship('ChatHistory', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    attachments = db.relationship('Attachment', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    rules = db.relationship('RuleDocument', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    
    def set_password(self, password):
        """设置密码哈希"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """验证密码"""
        return check_password_hash(self.password_hash, password)
    
    def update_last_login(self):
        """更新最后登录时间"""
        self.last_login = datetime.utcnow()
        db.session.commit()
    
    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'username': self.username,
            'created_at': format_datetime_value(self.created_at),
            'last_login': format_datetime_value(self.last_login)
        }
    
    def __repr__(self):
        return f'<User {self.username}>'


class ChatHistory(db.Model):
    """聊天历史模型"""
    __tablename__ = 'chat_history'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    conversation_id = db.Column(db.String(64), default='', index=True)
    conversation_title = db.Column(db.String(120), default='')
    question = db.Column(db.Text, nullable=False)
    question_html = db.Column(db.Text, default='')
    answer = db.Column(db.Text, nullable=False)
    answer_html = db.Column(db.Text, default='')
    attachment_ids = db.Column(db.Text, default='[]')
    model = db.Column(db.String(100), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    tokens_used = db.Column(db.Integer, default=0)
    
    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'conversation_id': self.conversation_id or '',
            'conversation_title': self.conversation_title or '',
            'question': self.question,
            'question_html': self.question_html or '',
            'answer': self.answer,
            'answer_html': self.answer_html or self.answer,
            'attachment_ids': self.attachment_ids or '[]',
            'model': self.model,
            'created_at': format_datetime_value(self.created_at),
            'tokens_used': self.tokens_used or 0
        }
    
    def __repr__(self):
        return f'<ChatHistory {self.id} - User {self.user_id}>'


class Attachment(db.Model):
    """附件模型"""
    __tablename__ = 'attachments'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    conversation_id = db.Column(db.String(64), default='', index=True)
    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.Text, nullable=False)
    extension = db.Column(db.String(16), default='', index=True)
    mime_type = db.Column(db.String(120), default='')
    size_bytes = db.Column(db.Integer, default=0)
    sha256 = db.Column(db.String(64), default='', index=True)
    parse_status = db.Column(db.String(20), default='ready')
    parse_error = db.Column(db.String(255), default='')
    extracted_text = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'conversation_id': self.conversation_id or '',
            'original_name': self.original_name,
            'extension': self.extension or '',
            'mime_type': self.mime_type or '',
            'size_bytes': self.size_bytes or 0,
            'parse_status': self.parse_status or 'ready',
            'parse_error': self.parse_error or '',
            'created_at': format_datetime_value(self.created_at)
        }

    def __repr__(self):
        return f'<Attachment {self.id} - User {self.user_id}>'


class RuleDocument(db.Model):
    """规则文档模型"""
    __tablename__ = 'rule_documents'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    rule_group_id = db.Column(db.String(32), nullable=False, index=True)
    version = db.Column(db.Integer, default=1)
    name = db.Column(db.String(255), nullable=False)
    extension = db.Column(db.String(16), default='')
    content_text = db.Column(db.Text, default='')
    status = db.Column(db.String(32), default='draft', index=True)
    is_current = db.Column(db.Boolean, default=True, index=True)
    is_active = db.Column(db.Boolean, default=False, index=True)
    ai_review_passed = db.Column(db.Boolean, default=False)
    ai_review_summary = db.Column(db.Text, default='')
    ai_review_raw = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'rule_group_id': self.rule_group_id,
            'version': self.version or 1,
            'name': self.name,
            'extension': self.extension or '',
            'status': self.status or 'draft',
            'is_current': bool(self.is_current),
            'is_active': bool(self.is_active),
            'ai_review_passed': bool(self.ai_review_passed),
            'ai_review_summary': self.ai_review_summary or '',
            'content_preview': (self.content_text or '')[:240],
            'created_at': format_datetime_value(self.created_at),
            'updated_at': format_datetime_value(self.updated_at)
        }

    def __repr__(self):
        return f'<RuleDocument {self.id} - User {self.user_id} - v{self.version}>'
