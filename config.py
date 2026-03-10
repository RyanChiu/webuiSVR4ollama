import os
import secrets
from datetime import timedelta

class Config:
    # Flask配置
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_urlsafe(64)
    
    # 数据库配置
    BASEDIR = os.path.abspath(os.path.dirname(__file__))
    DATA_DIR = os.path.expanduser(os.environ.get('APP_DATA_DIR', '~/.ollama-webui'))
    DB_PATH = os.path.abspath(os.path.expanduser(os.environ.get('APP_DB_PATH', os.path.join(DATA_DIR, 'app.db'))))
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DB_PATH}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Session配置
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    
    # Ollama配置
    OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
    DEFAULT_MODEL = 'qwen3:14b'
    
    # 应用配置
    MAX_HISTORY_ITEMS = 100
    PASSWORD_HASH_METHOD = 'pbkdf2:sha256'
