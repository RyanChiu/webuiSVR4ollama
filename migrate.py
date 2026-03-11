# migrate.py - 数据库迁移脚本（从单用户升级到多用户）
import os
import sys
from datetime import datetime

def migrate_to_multi_user():
    """从单用户系统迁移到多用户系统"""
    print("="*50)
    print("🔄 Ollama WebUI 数据库迁移")
    print("="*50)
    print("从单用户系统迁移到多用户系统")
    print("="*50)
    
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app import create_app
        from database import db, User, ChatHistory
        
        app = create_app()
        
        with app.app_context():
            # 检查旧表是否存在
            inspector = db.inspect(db.engine)
            tables = inspector.get_table_names()
            
            # 备份旧数据
            old_chats = []
            old_user = None
            
            if 'chat_history' in tables:
                # 获取旧的聊天记录
                result = db.session.execute('SELECT * FROM chat_history')
                for row in result:
                    old_chats.append(dict(row))
                print(f"📝 找到 {len(old_chats)} 条旧聊天记录")
            
            if 'user' in tables:
                # 获取旧用户
                result = db.session.execute('SELECT * FROM user')
                for row in result:
                    old_user = dict(row)
                if old_user:
                    print(f"👤 找到旧用户")
            
            # 创建新表
            print("📦 创建新数据库表...")
            db.create_all()
            
            # 迁移旧用户
            if old_user and 'password_hash' in old_user:
                print("🔄 迁移用户数据...")
                admin = User.query.filter_by(username='admin').first()
                if not admin:
                    admin = User(
                        username='admin',
                        created_at=datetime.utcnow(),
                        is_active=True
                    )
                    admin.password_hash = old_user['password_hash']
                    db.session.add(admin)
                    print("✅ 管理员用户迁移完成")
            
            # 迁移旧聊天记录
            if old_chats:
                print("🔄 迁移聊天记录...")
                admin = User.query.filter_by(username='admin').first()
                if admin:
                    migrated = 0
                    for old_chat in old_chats:
                        # 检查是否已存在
                        existing = ChatHistory.query.filter_by(
                            question=old_chat.get('question', ''),
                            created_at=datetime.fromisoformat(old_chat.get('created_at')) 
                            if old_chat.get('created_at') else datetime.utcnow()
                        ).first()
                        
                        if not existing:
                            chat = ChatHistory(
                                user_id=admin.id,
                                question=old_chat.get('question', ''),
                                answer=old_chat.get('answer', ''),
                                model=old_chat.get('model', os.environ.get('DEFAULT_MODEL', '').strip()),
                                created_at=datetime.fromisoformat(old_chat.get('created_at')) 
                                if old_chat.get('created_at') else datetime.utcnow(),
                                tokens_used=old_chat.get('tokens_used', 0)
                            )
                            db.session.add(chat)
                            migrated += 1
                    
                    db.session.commit()
                    print(f"✅ 迁移了 {migrated} 条聊天记录")
            
            print("\n✅ 数据库迁移完成!")
            print("\n📊 迁移后统计:")
            print(f"   - 用户数量: {User.query.count()}")
            print(f"   - 聊天记录: {ChatHistory.query.count()}")
            
            return True
            
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    migrate_to_multi_user()
