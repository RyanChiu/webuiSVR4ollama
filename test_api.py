# test_api.py - 测试API接口
import requests
import json
import sys

def test_api():
    base_url = "http://localhost:5000"
    
    print("测试API接口")
    print("="*60)
    
    # 获取会话（用于保存cookies）
    session = requests.Session()
    
    # 1. 登录
    print("1. 登录测试...")
    try:
        response = session.post(
            f"{base_url}/login",
            json={"password": "test123"},  # 使用你的密码
            timeout=10
        )
        
        print(f"   状态码: {response.status_code}")
        print(f"   内容类型: {response.headers.get('content-type')}")
        
        if response.headers.get('content-type', '').startswith('application/json'):
            data = response.json()
            print(f"   响应JSON: {json.dumps(data, ensure_ascii=False)}")
            if data.get('success'):
                print("   ✓ 登录成功")
            else:
                print(f"   ✗ 登录失败: {data.get('message')}")
                return False
        else:
            text = response.text[:200]
            print(f"   响应文本: {text}...")
            print("   ✗ 不是JSON响应")
            return False
            
    except Exception as e:
        print(f"   ✗ 登录请求失败: {e}")
        return False
    
    # 2. 测试健康检查
    print("\n2. 健康检查测试...")
    try:
        response = session.get(f"{base_url}/health", timeout=5)
        print(f"   状态码: {response.status_code}")
        if response.headers.get('content-type', '').startswith('application/json'):
            data = response.json()
            print(f"   响应: {data}")
            print(f"   认证状态: {data.get('authenticated', 'unknown')}")
        else:
            print(f"   响应: {response.text[:200]}")
    except Exception as e:
        print(f"   ✗ 健康检查失败: {e}")
    
    # 3. 测试聊天API
    print("\n3. 聊天API测试...")
    try:
        response = session.post(
            f"{base_url}/api/chat",
            json={
                "question": "你好，简单介绍一下你自己",
                "model": "qwen3:14b"
            },
            timeout=60  # 给AI足够时间响应
        )
        
        print(f"   状态码: {response.status_code}")
        print(f"   内容类型: {response.headers.get('content-type')}")
        
        if response.headers.get('content-type', '').startswith('application/json'):
            data = response.json()
            if data.get('success'):
                answer = data.get('answer', '')
                print(f"   ✓ 聊天成功")
                print(f"   回答长度: {len(answer)} 字符")
                print(f"   Token使用: {data.get('tokens_used', 0)}")
                print(f"   回答预览: {answer[:100]}...")
            else:
                print(f"   ✗ 聊天失败: {data.get('message')}")
        else:
            text = response.text[:500]
            print(f"   响应文本: {text}...")
            print("   ✗ 不是JSON响应")
            
    except Exception as e:
        print(f"   ✗ 聊天请求失败: {e}")
    
    # 4. 测试历史记录API
    print("\n4. 历史记录API测试...")
    try:
        response = session.get(f"{base_url}/api/history", timeout=5)
        print(f"   状态码: {response.status_code}")
        if response.headers.get('content-type', '').startswith('application/json'):
            data = response.json()
            if data.get('success'):
                history = data.get('history', [])
                print(f"   ✓ 获取历史成功，数量: {len(history)}")
            else:
                print(f"   ✗ 获取历史失败: {data.get('message')}")
        else:
            print(f"   响应: {response.text[:200]}")
    except Exception as e:
        print(f"   ✗ 历史记录请求失败: {e}")
    
    # 5. 测试模型列表API
    print("\n5. 模型列表API测试...")
    try:
        response = session.get(f"{base_url}/api/models", timeout=5)
        print(f"   状态码: {response.status_code}")
        if response.headers.get('content-type', '').startswith('application/json'):
            data = response.json()
            if data.get('success'):
                models = data.get('models', [])
                print(f"   ✓ 获取模型列表成功")
                print(f"   可用模型: {', '.join(models)}")
            else:
                print(f"   ✗ 获取模型列表失败: {data.get('message')}")
        else:
            print(f"   响应: {response.text[:200]}")
    except Exception as e:
        print(f"   ✗ 模型列表请求失败: {e}")
    
    print("\n" + "="*60)
    print("测试完成")
    return True

if __name__ == '__main__':
    test_api()
