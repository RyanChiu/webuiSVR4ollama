// 登录页面的JavaScript（与main.js中的LoginApp相同，单独文件便于管理）
class LoginApp {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const form = document.getElementById('loginForm');
        const toggleBtn = document.getElementById('togglePassword');
        const passwordInput = document.getElementById('password');
        
        form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                toggleBtn.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            });
        }
        
        // 按Enter键提交
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                form.dispatchEvent(new Event('submit'));
            }
        });
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        // 禁用按钮并显示加载状态
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showMessage('操作成功，正在跳转...', 'success');
                setTimeout(() => {
                    window.location.href = data.redirect;
                }, 1000);
            } else {
                throw new Error(data.message || '操作失败');
            }
        } catch (error) {
            console.error('操作失败:', error);
            this.showMessage(error.message, 'error');
        } finally {
            // 恢复按钮状态
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    showMessage(message, type) {
        const messageBox = document.getElementById('message');
        messageBox.textContent = message;
        messageBox.className = `message-box ${type}`;
        messageBox.style.display = 'block';
        
        // 3秒后自动隐藏
        setTimeout(() => {
            messageBox.style.display = 'none';
        }, 3000);
    }
}

// 初始化登录应用
document.addEventListener('DOMContentLoaded', () => {
    new LoginApp();
});
