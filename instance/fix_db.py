import sqlite3
import os

def fix_database():
    """修复数据库，确保所有必要字段存在"""
    db_file = 'app.db'
    
    if not os.path.exists(db_file):
        print("❌ 数据库文件不存在")
        return False
    
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    # 检查chat_history表
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history'")
    if not cursor.fetchone():
        print("❌ chat_history表不存在")
        conn.close()
        return False
    
    # 检查字段
    cursor.execute("PRAGMA table_info(chat_history)")
    columns = {column[1]: column for column in cursor.fetchall()}
    
    print("📊 chat_history表字段:")
    for col_name in columns.keys():
        print(f"  - {col_name}")
    
    # 添加缺失的字段
    if 'answer_html' not in columns:
        print("📦 添加 answer_html 字段...")
        cursor.execute("ALTER TABLE chat_history ADD COLUMN answer_html TEXT DEFAULT ''")
        print("✓ answer_html 字段添加成功")
    
    # 更新现有记录的answer_html
    cursor.execute("UPDATE chat_history SET answer_html = answer WHERE answer_html IS NULL OR answer_html = ''")
    print(f"✓ 更新了 {cursor.rowcount} 条记录的 answer_html")
    
    conn.commit()
    conn.close()
    
    print("\n✅ 数据库修复完成")
    return True

def check_ollama_models():
    """检查Ollama中的模型"""
    import requests
    
    try:
        response = requests.get('http://localhost:11434/api/tags', timeout=5)
        if response.status_code == 200:
            data = response.json()
            models = data.get('models', [])
            
            print("\n🤖 Ollama中的模型:")
            for model in models:
                if isinstance(model, dict):
                    name = model.get('name', '未知')
                    size = model.get('size', '未知')
                    modified = model.get('modified_at', '未知')
                    print(f"  - {name} ({size}) - {modified}")
                else:
                    print(f"  - {model}")
            
            return [m['name'] if isinstance(m, dict) else m for m in models]
        else:
            print(f"\n⚠️ Ollama返回状态码: {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("\n⚠️ 无法连接到Ollama服务，请确保Ollama已启动: ollama serve")
    except Exception as e:
        print(f"\n⚠️ 检查Ollama失败: {e}")
    
    return []

if __name__ == '__main__':
    print("="*50)
    print("🔧 Ollama WebUI 数据库修复工具")
    print("="*50)
    
    fix_database()
    check_ollama_models()
    
    print("\n" + "="*50)
    print("请重启应用: python app.py")
    print("="*50)
