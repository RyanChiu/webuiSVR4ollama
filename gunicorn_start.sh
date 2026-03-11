#!/bin/bash

# start.sh - 启动脚本
set -e

echo "🚀 启动 Ollama WebUI..."

# 检查Ollama服务
echo "📡 检查Ollama服务..."
if curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "✅ Ollama服务正常"
else
    echo "⚠️ Ollama服务未运行，请先启动: ollama serve"
    exit 1
fi

# 不在启动脚本中自动拉取模型
# 模型由用户自行管理（pull / 删除 / 切换）

# 创建日志目录
mkdir -p logs

# 数据库路径（与 app.py 保持一致）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${APP_DATA_DIR:-$SCRIPT_DIR/app_data}"
DB_FILE="${APP_DB_PATH:-$DATA_DIR/app.db}"
mkdir -p "$(dirname "$DB_FILE")"

# 检查数据库
if [ ! -f "$DB_FILE" ]; then
    echo "🗄️ 初始化数据库..."
    python -c "from app import app, db; app.app_context().push(); db.create_all()"
fi

# 选择启动方式
if command -v gunicorn &> /dev/null; then
    echo "🌐 使用Gunicorn启动..."
    echo "📝 访问地址: http://localhost:5001"
    echo "="*50
    gunicorn -c gunicorn_config.py "app:create_app()"
else
    echo "⚠️ Gunicorn未安装，使用Flask开发服务器..."
    echo "📝 访问地址: http://localhost:5001"
    echo "="*50
    python app.py
fi
