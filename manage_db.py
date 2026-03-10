# manage_db.py - 数据库管理命令行工具
#!/usr/bin/env python3
import os
import sys
import click
from datetime import datetime

@click.group()
def cli():
    """Ollama WebUI 数据库管理工具"""
    pass

@cli.command()
@click.option('--force', is_flag=True, help='强制初始化')
def init(force):
    """初始化数据库"""
    from init_db import init_database
    if force:
        click.confirm('强制初始化会保留现有数据，确定继续？', abort=True)
    init_database()

@cli.command()
@click.confirmation_option(prompt='⚠️ 确定要重置数据库吗？所有数据将被删除！')
def reset():
    """重置数据库（危险操作）"""
    from init_db import reset_database
    reset_database()

@cli.command()
def backup():
    """备份数据库"""
    from init_db import backup_database
    backup_database()

@cli.command()
def migrate():
    """迁移数据库（从单用户到多用户）"""
    from migrate import migrate_to_multi_user
    migrate_to_multi_user()

@cli.command()
def stats():
    """查看数据库统计"""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app import create_app
        from database import db, User, ChatHistory
        
        app = create_app()
        with app.app_context():
            user_count = User.query.count()
            chat_count = ChatHistory.query.count()
            
            # 获取各用户聊天记录统计
            print("\n📊 数据库统计")
            print("="*50)
            print(f"总用户数: {user_count}")
            print(f"总聊天记录: {chat_count}")
            print("-"*50)
            
            if user_count > 0:
                print("\n用户详情:")
                for user in User.query.all():
                    user_chats = ChatHistory.query.filter_by(user_id=user.id).count()
                    last_login = user.last_login.strftime('%Y-%m-%d %H:%M') if user.last_login else '从未'
                    print(f"  - {user.username}: {user_chats}条记录, 最后登录: {last_login}")
            
            print("="*50)
            
    except Exception as e:
        print(f"❌ 获取统计失败: {e}")

@cli.command()
@click.argument('username')
@click.option('--password', prompt=True, hide_input=True, confirmation_prompt=True)
def create_user(username, password):
    """创建新用户"""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app import create_app
        from database import db, User
        
        app = create_app()
        with app.app_context():
            if User.query.filter_by(username=username).first():
                click.echo(f"❌ 用户名 {username} 已存在")
                return
            
            user = User(
                username=username,
                created_at=datetime.utcnow(),
                is_active=True
            )
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            click.echo(f"✅ 用户 {username} 创建成功")
            
    except Exception as e:
        click.echo(f"❌ 创建用户失败: {e}")

@cli.command()
@click.argument('username')
def delete_user(username):
    """删除用户"""
    if username == 'admin':
        click.echo("❌ 不能删除管理员用户")
        return
    
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app import create_app
        from database import db, User
        
        app = create_app()
        with app.app_context():
            user = User.query.filter_by(username=username).first()
            if not user:
                click.echo(f"❌ 用户 {username} 不存在")
                return
            
            click.confirm(f'⚠️ 确定要删除用户 {username} 吗？该用户的所有聊天记录也将被删除', abort=True)
            db.session.delete(user)
            db.session.commit()
            click.echo(f"✅ 用户 {username} 已删除")
            
    except Exception as e:
        click.echo(f"❌ 删除用户失败: {e}")

@cli.command()
@click.argument('username')
@click.option('--password', prompt=True, hide_input=True, confirmation_prompt=True)
def reset_password(username, password):
    """重置用户密码"""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app import create_app
        from database import db, User
        
        app = create_app()
        with app.app_context():
            user = User.query.filter_by(username=username).first()
            if not user:
                click.echo(f"❌ 用户 {username} 不存在")
                return
            
            user.set_password(password)
            db.session.commit()
            click.echo(f"✅ 用户 {username} 密码已重置")
            
    except Exception as e:
        click.echo(f"❌ 重置密码失败: {e}")

@cli.command()
def list_users():
    """列出所有用户"""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app import create_app
        from database import db, User, ChatHistory
        
        app = create_app()
        with app.app_context():
            users = User.query.order_by(User.created_at.desc()).all()
            
            if not users:
                click.echo("暂无用户")
                return
            
            click.echo("\n👥 用户列表")
            click.echo("="*80)
            click.echo(f"{'ID':<5} {'用户名':<20} {'创建时间':<20} {'最后登录':<20} {'聊天记录':<10}")
            click.echo("-"*80)
            
            for user in users:
                chat_count = ChatHistory.query.filter_by(user_id=user.id).count()
                created = user.created_at.strftime('%Y-%m-%d %H:%M') if user.created_at else '未知'
                last_login = user.last_login.strftime('%Y-%m-%d %H:%M') if user.last_login else '从未'
                click.echo(f"{user.id:<5} {user.username:<20} {created:<20} {last_login:<20} {chat_count:<10}")
            
            click.echo("="*80)
            
    except Exception as e:
        click.echo(f"❌ 获取用户列表失败: {e}")

if __name__ == '__main__':
    cli()
