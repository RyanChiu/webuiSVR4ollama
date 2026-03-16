#!/bin/bash

# start.sh - 启动脚本
set -e

echo "🚀 启动 Ollama WebUI..."

# macOS fork 安全兼容（优先在 shell 层注入，避免 Gunicorn 子进程初始化时机问题）
if [ "$(uname -s)" = "Darwin" ]; then
    export OBJC_DISABLE_INITIALIZE_FORK_SAFETY="${OBJC_DISABLE_INITIALIZE_FORK_SAFETY:-YES}"
    export GUNICORN_WORKERS="${GUNICORN_WORKERS:-1}"
    export GUNICORN_WORKER_CLASS="${GUNICORN_WORKER_CLASS:-gthread}"
    export GUNICORN_THREADS="${GUNICORN_THREADS:-4}"
fi

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
PID_FILE="$SCRIPT_DIR/gunicorn.pid"
mkdir -p "$(dirname "$DB_FILE")"

# 检查数据库
if [ ! -f "$DB_FILE" ]; then
    echo "🗄️ 初始化数据库..."
    python -c "from app import app, db; app.app_context().push(); db.create_all()"
fi

# 选择启动方式
if command -v gunicorn &> /dev/null; then
    # 若旧实例存在，先优雅停掉，避免重复进程占用同端口
    if [ -f "$PID_FILE" ]; then
        OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
        if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
            echo "♻️ 检测到旧Gunicorn实例(PID=$OLD_PID)，先停止..."
            kill -TERM "$OLD_PID"
            for _ in {1..20}; do
                if kill -0 "$OLD_PID" 2>/dev/null; then
                    sleep 0.5
                else
                    break
                fi
            done
            if kill -0 "$OLD_PID" 2>/dev/null; then
                echo "⚠️ 旧实例停止超时，强制结束(PID=$OLD_PID)"
                kill -KILL "$OLD_PID" || true
            fi
        fi
        rm -f "$PID_FILE"
    fi

    echo "🌐 使用Gunicorn启动..."
    echo "📝 访问地址: http://localhost:5001"
    echo "="*50
    gunicorn -c gunicorn_config.py --pid "$PID_FILE" "app:create_app()"
else
    echo "⚠️ Gunicorn未安装，使用Flask开发服务器..."
    echo "📝 访问地址: http://localhost:5001"
    echo "="*50
    python app.py
fi
