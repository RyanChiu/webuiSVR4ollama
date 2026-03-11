# gunicorn_config.py
import multiprocessing
import os
import platform

# 绑定地址和端口
bind = "0.0.0.0:5001"

is_darwin = platform.system() == "Darwin"

# 工作进程与模式
# macOS 下默认使用更稳的线程模型，避免 Objective-C fork 崩溃。
if is_darwin:
    workers = int(os.environ.get("GUNICORN_WORKERS", "1"))
    worker_class = os.environ.get("GUNICORN_WORKER_CLASS", "gthread")
    threads = int(os.environ.get("GUNICORN_THREADS", "4"))
else:
    workers = int(os.environ.get("GUNICORN_WORKERS", str(multiprocessing.cpu_count() * 2 + 1)))
    worker_class = os.environ.get("GUNICORN_WORKER_CLASS", "sync")
    threads = int(os.environ.get("GUNICORN_THREADS", "1"))

# 每个worker的最大请求数
max_requests = 1000
max_requests_jitter = 50

# 超时设置（秒）
timeout = 300  # AI推理可能需要较长时间
keepalive = 5

# 进程名称
proc_name = "ollama-webui"

# 日志配置
accesslog = "./logs/access.log"
errorlog = "./logs/error.log"
loglevel = "info"

# 捕获输出
capture_output = True

# 预加载应用
# macOS 下关闭 preload_app，降低 fork 后崩溃概率。
preload_app = False if is_darwin else True

# 环境变量
raw_env = [
    "FLASK_ENV=production",
    "PYTHONPATH=.",
]
if is_darwin:
    # 兼容某些第三方库在 macOS fork 后触发的 Objective-C 运行时保护崩溃。
    raw_env.append("OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES")

# 优雅重启
graceful_timeout = 30
