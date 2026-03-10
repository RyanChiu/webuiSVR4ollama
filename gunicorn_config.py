# gunicorn_config.py
import multiprocessing
import os

# 绑定地址和端口
bind = "0.0.0.0:5000"

# 工作进程数
workers = multiprocessing.cpu_count() * 2 + 1

# 工作模式
worker_class = "sync"

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
preload_app = True

# 环境变量
raw_env = [
    "FLASK_ENV=production",
    "PYTHONPATH=.",
]

# 优雅重启
graceful_timeout = 30
