# reset.py - 重置数据库
import os

def reset_database():
    print("正在重置数据库...")
    
    # 删除数据库文件
    if os.path.exists('app.db'):
        os.remove('app.db')
        print("✓ 已删除 app.db")
    
    # 重新创建数据库
    from app import create_app
    app = create_app()
    
    with app.app_context():
        from database import db, User
        db.create_all()
        print("✓ 数据库表已创建")
        
        # 检查
        user = User.get_user()
        if user:
            print(f"✗ 意外找到用户: {user.id}")
        else:
            print("✓ 数据库状态正常，无用户")
    
    print("\n重置完成！请重新访问 http://localhost:5000 设置密码")

if __name__ == '__main__':
    reset_database()
