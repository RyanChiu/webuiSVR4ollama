# add_markdown_field.py
import sqlite3
import os

def add_markdown_field():
    """为chat_history表添加answer_html字段"""
    db_file = 'app.db'
    
    if not os.path.exists(db_file):
        print("数据库文件不存在")
        return
    
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    # 检查字段是否已存在
    cursor.execute("PRAGMA table_info(chat_history)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'answer_html' not in columns:
        print("添加 answer_html 字段...")
        cursor.execute("ALTER TABLE chat_history ADD COLUMN answer_html TEXT")
        print("✓ answer_html 字段添加成功")
    else:
        print("✓ answer_html 字段已存在")
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    add_markdown_field()
