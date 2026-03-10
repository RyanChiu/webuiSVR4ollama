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

# 检查模型
echo "🤖 检查Qwen3:14b模型..."
if curl -s http://localhost:11434/api/tags | grep -q "qwen3:14b"; then
    echo "✅ 模型已存在"
else
    echo "📥 下载Qwen3:14b模型..."
    ollama pull qwen3:14b
fi

# 创建日志目录
mkdir -p logs

# 检查数据库
if [ ! -f "app.db" ]; then
    echo "🗄️ 初始化数据库..."
    python -c "from app import app, db; app.app_context().push(); db.create_all()"
fi

# 选择启动方式
if command -v gunicorn &> /dev/null; then
    echo "🌐 使用Gunicorn启动..."
    echo "📝 访问地址: http://localhost:5000"
    echo "="*50
    gunicorn -c gunicorn_config.py "app:create_app()"
else
    echo "⚠️ Gunicorn未安装，使用Flask开发服务器..."
    echo "📝 访问地址: http://localhost:5000"
    echo "="*50
    python app.py
fi
