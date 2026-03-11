# init_db.py - 数据库初始化脚本
import os
import sys
from datetime import datetime

def resolve_db_file():
    """解析数据库文件路径（与 app.py 保持一致）"""
    db_path = os.environ.get('APP_DB_PATH')
    if db_path:
        return os.path.abspath(os.path.expanduser(db_path))
    base_dir = os.path.abspath(os.path.dirname(__file__))
    data_dir = os.path.abspath(os.path.expanduser(os.environ.get('APP_DATA_DIR', os.path.join(base_dir, 'app_data'))))
    return os.path.join(data_dir, 'app.db')


def init_database():
    """初始化数据库"""
    print("="*50)
    print("🗄️ Ollama WebUI 数据库初始化")
    print("="*50)
    
    try:
        # 导入应用
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app import create_app
        from database import db, User, ChatHistory, SystemConfig
        
        app = create_app()
        
        with app.app_context():
            # 创建所有表
            print("📦 创建数据库表...")
            db.create_all()
            print("✅ 数据库表创建成功")
            
            # 检查是否需要初始化管理员
            admin = User.query.filter_by(username='admin').first()
            if not admin:
                admin_init_password = os.environ.get('ADMIN_INIT_PASSWORD')
                if admin_init_password:
                    print("👤 初始化管理员用户...")
                    admin = User(
                        username='admin',
                        created_at=datetime.utcnow(),
                        is_active=True
                    )
                    admin.set_password(admin_init_password)
                    db.session.add(admin)
                    print("✅ 管理员用户创建成功 (admin)")
                else:
                    print("⚠️ 未设置 ADMIN_INIT_PASSWORD，已跳过默认管理员创建")
            else:
                print("ℹ️ 管理员用户已存在")
            
            # 初始化系统配置
            default_configs = [
                ('default_model', os.environ.get('DEFAULT_MODEL', '').strip(), '默认使用的模型'),
                ('max_history_per_user', '100', '每个用户最大历史记录数'),
                ('ollama_base_url', 'http://localhost:11434', 'Ollama服务地址'),
                ('system_init_time', datetime.utcnow().isoformat(), '系统初始化时间')
            ]
            
            for key, value, desc in default_configs:
                config = SystemConfig.query.filter_by(key=key).first()
                if not config:
                    config = SystemConfig(
                        key=key,
                        value=value,
                        description=desc,
                        updated_at=datetime.utcnow()
                    )
                    db.session.add(config)
                    print(f"⚙️ 添加系统配置: {key} = {value}")
            
            db.session.commit()
            print("✅ 系统配置初始化完成")
            
            # 显示数据库统计
            user_count = User.query.count()
            chat_count = ChatHistory.query.count()
            print(f"\n📊 数据库统计:")
            print(f"   - 用户数量: {user_count}")
            print(f"   - 聊天记录: {chat_count}")
            
            print("\n✅ 数据库初始化完成!")
            return True
            
    except Exception as e:
        print(f"❌ 数据库初始化失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def reset_database():
    """重置数据库（危险操作！）"""
    print("="*50)
    print("⚠️  Ollama WebUI 数据库重置")
    print("="*50)
    print("警告: 此操作将删除所有数据!")
    print("   - 所有用户账号将被删除")
    print("   - 所有聊天历史将被删除")
    print("   - 所有系统配置将被重置")
    print("="*50)
    
    confirm = input("请输入 'RESET' 确认重置数据库: ")
    if confirm != 'RESET':
        print("❌ 操作已取消")
        return False
    
    try:
        # 删除数据库文件
        db_files = [
            resolve_db_file(),
            'app.db',
            'instance/app.db',
            'database.db'
        ]
        for db_file in db_files:
            if os.path.exists(db_file):
                os.remove(db_file)
                print(f"🗑️ 删除数据库文件: {db_file}")
        
        # 重新初始化
        return init_database()
        
    except Exception as e:
        print(f"❌ 数据库重置失败: {e}")
        return False

def backup_database():
    """备份数据库"""
    import shutil
    from datetime import datetime
    
    db_file = resolve_db_file()
    if not os.path.exists(db_file):
        print("❌ 数据库文件不存在")
        return False
    
    backup_dir = 'backups'
    os.makedirs(backup_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = f'{backup_dir}/app_{timestamp}.db'
    
    try:
        shutil.copy2(db_file, backup_file)
        print(f"✅ 数据库已备份到: {backup_file}")
        return True
    except Exception as e:
        print(f"❌ 备份失败: {e}")
        return False

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Ollama WebUI 数据库管理')
    parser.add_argument('action', choices=['init', 'reset', 'backup'], 
                       help='操作: init(初始化), reset(重置), backup(备份)')
    
    args = parser.parse_args()
    
    if args.action == 'init':
        init_database()
    elif args.action == 'reset':
        reset_database()
    elif args.action == 'backup':
        backup_database()
