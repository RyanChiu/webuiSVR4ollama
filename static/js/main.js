class ChatApp {
    constructor() {
        this.currentConversationId = null;
        this.currentHistory = [];
        this.allHistory = [];
        this.searchTerm = '';
        this.isThinking = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadModels();
        this.loadHistory();
        this.loadUserInfo();
    }

    bindEvents() {
        // 发送消息
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
        
        // 键盘事件
        const questionInput = document.getElementById('questionInput');
        if (questionInput) {
            questionInput.addEventListener('keydown', (e) => {
                const isCtrlEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
                if (isCtrlEnter) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // 搜索
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchHistory());
        }
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchHistory();
            });
        }

        // 历史记录操作
        const clearHistoryBtn = document.getElementById('clearHistory');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        }
        
        const refreshHistoryBtn = document.getElementById('refreshHistory');
        if (refreshHistoryBtn) {
            refreshHistoryBtn.addEventListener('click', () => this.refreshHistory());
        }

        // 聊天操作
        const clearChatBtn = document.getElementById('clearChat');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => this.clearChat());
        }

        // 退出登录
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('确定要退出登录吗？')) {
                    window.location.href = '/logout';
                }
            });
        }

        // 自动滚动
        const autoScroll = document.getElementById('autoScroll');
        if (autoScroll) {
            autoScroll.addEventListener('change', () => {
                if (autoScroll.checked) {
                    this.scrollToBottom();
                }
            });
        }
        
        // 密码模态框Enter键支持
        const newPassword = document.getElementById('newPassword');
        if (newPassword) {
            newPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.changePassword();
            });
        }
        
        const confirmPassword = document.getElementById('confirmPassword');
        if (confirmPassword) {
            confirmPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.changePassword();
            });
        }
    }

    // ============ 用户信息 ============
    async loadUserInfo() {
        try {
            const response = await fetch('/api/user/info');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                const user = data.user;
                const userNameEl = document.getElementById('userName');
                const userAvatarEl = document.getElementById('userAvatar');
                
                if (userNameEl) userNameEl.textContent = user.username || '用户';
                if (userAvatarEl) userAvatarEl.textContent = (user.username || 'U').charAt(0).toUpperCase();
                
                const userRoleEl = document.getElementById('userRole');
                if (userRoleEl) {
                    const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString('zh-CN') : '首次登录';
                    userRoleEl.textContent = `上次登录: ${lastLogin}`;
                }
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
            // 如果获取用户信息失败，可能是未登录，跳转到登录页
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                window.location.href = '/login';
            }
        }
    }

    // ============ 模型管理 ============
    async loadModels() {
        try {
            const response = await fetch('/api/models');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('modelSelect');
                if (select) {
                    select.innerHTML = '';
                    if (data.models && data.models.length > 0) {
                        data.models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            if (model === 'qwen3:14b') option.selected = true;
                            select.appendChild(option);
                        });
                    } else {
                        // 默认选项
                        const option = document.createElement('option');
                        option.value = 'qwen3:14b';
                        option.textContent = 'qwen3:14b';
                        option.selected = true;
                        select.appendChild(option);
                    }
                }
            }
        } catch (error) {
            console.error('加载模型失败:', error);
        }
    }

    // ============ 历史记录管理 ============
    async loadHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        try {
            const response = await fetch('/api/history');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                this.allHistory = data.history || [];
                this.renderHistoryList();
            } else {
                throw new Error(data.message || '加载失败');
            }
        } catch (error) {
            console.error('加载历史失败:', error);
            historyList.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>加载失败，请刷新重试</p>
                    <button onclick="app.refreshHistory()" style="margin-top:10px; padding:8px 16px; background:var(--primary); color:white; border:none; border-radius:4px; cursor:pointer;">
                        <i class="fas fa-sync-alt"></i> 重试
                    </button>
                </div>
            `;
        }
    }

    renderHistoryList() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        if (!this.allHistory || this.allHistory.length === 0) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-inbox"></i>
                    <p>暂无历史记录</p>
                    <p style="font-size:12px; margin-top:8px;">开始聊天吧！</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        this.allHistory.forEach(item => {
            // 截断问题文本
            const question = item.question && item.question.length > 50 
                ? item.question.substring(0, 50) + '...' 
                : item.question || '空消息';
            
            // 格式化时间
            let timeStr = '';
            if (item.created_at) {
                try {
                    const date = new Date(item.created_at);
                    timeStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                } catch (e) {
                    timeStr = item.created_at;
                }
            } else {
                timeStr = '未知时间';
            }
            
            const activeClass = this.currentConversationId === item.id ? 'active' : '';
            
            html += `
                <div class="history-item ${activeClass}" data-id="${item.id}">
                    <h4 title="${this.escapeHtml(item.question || '')}">${this.escapeHtml(question)}</h4>
                    <div class="history-meta">
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        <button class="delete-history" onclick="app.deleteHistoryItem(${item.id}, event)">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        historyList.innerHTML = html;
        
        // 重新绑定点击事件
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-history')) {
                    const historyId = parseInt(item.dataset.id);
                    this.loadConversation(historyId);
                }
            });
        });
    }

    async loadConversation(historyId) {
        try {
            const response = await fetch('/api/history');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                const historyItem = data.history.find(h => h.id === historyId);
                if (historyItem) {
                    this.currentConversationId = historyId;
                    this.currentHistory = [
                        { type: 'question', content: historyItem.question || '' },
                        { type: 'answer', content: historyItem.answer || '' }
                    ];
                    
                    // 更新高亮
                    this.renderHistoryList();
                    
                    // 显示对话
                    this.displayConversation();
                    
                    // 聚焦输入框
                    const input = document.getElementById('questionInput');
                    if (input) input.focus();
                }
            }
        } catch (error) {
            console.error('加载对话失败:', error);
            this.showToast('加载对话失败: ' + error.message, 'error');
        }
    }

    displayConversation() {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        
        this.currentHistory.forEach(msg => {
            this.displayMessage(msg.type, msg.content);
        });
        
        this.scrollToBottom();
    }

    // ============ 思考动画 ============
    showThinking() {
        if (this.isThinking) return;
        this.isThinking = true;
        
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        // 检查是否已存在思考消息
        if (document.getElementById('thinking-message')) {
            return;
        }
        
        const thinkingMessage = document.createElement('div');
        thinkingMessage.className = 'message answer thinking-message';
        thinkingMessage.id = 'thinking-message';
        thinkingMessage.innerHTML = `
            <div class="message-header">
                <i class="fas fa-robot"></i>
                <strong>AI助手</strong>
            </div>
            <div class="message-content thinking-content">
                <span class="thinking-text">正在思考</span>
                <span class="thinking-dots">...</span>
            </div>
        `;
        
        messagesContainer.appendChild(thinkingMessage);
        this.scrollToBottom();
        
        let dotCount = 0;
        this.thinkingInterval = setInterval(() => {
            const dotsElement = document.querySelector('.thinking-dots');
            if (dotsElement) {
                dotCount = (dotCount % 3) + 1;
                dotsElement.textContent = '.'.repeat(dotCount);
            }
        }, 500);
    }

    hideThinking() {
        this.isThinking = false;
        if (this.thinkingInterval) {
            clearInterval(this.thinkingInterval);
            this.thinkingInterval = null;
        }
        const thinkingMessage = document.getElementById('thinking-message');
        if (thinkingMessage) {
            thinkingMessage.remove();
        }
    }

    // ============ 发送消息 ============
    async sendMessage() {
        const input = document.getElementById('questionInput');
        if (!input) return;
        
        const question = input.value.trim();
        
        if (!question) {
            this.showToast('请输入问题', 'warning');
            return;
        }
        
        // 显示用户问题
        this.displayMessage('question', question);
        
        // 清空输入框
        input.value = '';
        
        // 显示思考动画
        this.showThinking();
        
        try {
            const modelSelect = document.getElementById('modelSelect');
            const model = modelSelect ? modelSelect.value : 'qwen3:14b';
            
            // 构建上下文
            let prompt = question;
            if (this.currentConversationId && this.currentHistory.length > 0) {
                const context = this.currentHistory
                    .slice(-4)  // 取最近4条消息
                    .map(msg => (msg.type === 'question' ? '用户' : '助手') + ': ' + msg.content)
                    .join('\n');
                prompt = context + '\n用户: ' + question;
            }
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    question: prompt, 
                    model: model 
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            this.hideThinking();
            
            if (data.success) {
                // 显示回答
                this.displayMessage('answer', data.answer);
                
                // 添加到当前对话历史
                this.currentHistory.push(
                    { type: 'question', content: question },
                    { type: 'answer', content: data.answer }
                );
                
                // 刷新历史记录列表
                await this.loadHistory();
                
                // 更新统计数据
                this.updateStats({ 
                    tokens_used: data.tokens_used || 0,
                    timestamp: new Date()
                });
                
                this.showToast('发送成功', 'success');
            } else {
                throw new Error(data.message || '发送失败');
            }
        } catch (error) {
            this.hideThinking();
            console.error('发送消息失败:', error);
            
            // 移除刚才显示的问题
            const messages = document.getElementById('messages');
            if (messages) {
                const lastMessage = messages.lastElementChild;
                if (lastMessage && lastMessage.classList.contains('question')) {
                    messages.removeChild(lastMessage);
                }
            }
            
            this.showToast('发送失败: ' + error.message, 'error');
        }
    }

    // ============ 显示消息 ============
    displayMessage(type, content) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        const message = this.createMessage(type, content);
        messagesContainer.appendChild(message);
        
        const autoScroll = document.getElementById('autoScroll');
        if (autoScroll && autoScroll.checked) {
            this.scrollToBottom();
        }
    }

    createMessage(type, content) {
        const message = document.createElement('div');
        message.className = 'message ' + type;
        
        const icon = type === 'question' ? 'fa-user' : 'fa-robot';
        const header = type === 'question' ? '您' : 'AI助手';
        
        let timeStr = '';
        try {
            const now = new Date();
            timeStr = now.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (e) {
            timeStr = '刚刚';
        }
        
        // 转义HTML并处理换行
        const formattedContent = this.escapeHtml(content || '').replace(/\n/g, '<br>');
        
        message.innerHTML = `
            <div class="message-header">
                <i class="fas ${icon}"></i>
                <strong>${header}</strong>
            </div>
            <div class="message-content">${formattedContent}</div>
            <div class="message-footer">
                <i class="fas fa-clock"></i> ${timeStr}
            </div>
        `;
        
        return message;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============ 更新统计 ============
    updateStats(stats) {
        if (stats) {
            const tokenCount = document.getElementById('tokenCount');
            if (tokenCount) {
                tokenCount.innerHTML = `<i class="fas fa-microchip"></i> Tokens: ${stats.tokens_used || 0}`;
            }
            
            const responseTime = document.getElementById('responseTime');
            if (responseTime) {
                let timeStr = '--:--:--';
                if (stats.timestamp) {
                    try {
                        const date = stats.timestamp instanceof Date ? stats.timestamp : new Date(stats.timestamp);
                        timeStr = date.toLocaleTimeString('zh-CN', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            second: '2-digit'
                        });
                    } catch (e) {
                        timeStr = '刚刚';
                    }
                }
                responseTime.innerHTML = `<i class="fas fa-clock"></i> 时间: ${timeStr}`;
            }
        }
    }

    // ============ 滚动到底部 ============
    scrollToBottom() {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // ============ 搜索历史 ============
    searchHistory() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            this.searchTerm = searchInput.value.trim();
            this.filterHistory();
        }
    }

    filterHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        if (!this.searchTerm) {
            this.renderHistoryList();
            return;
        }
        
        const filtered = this.allHistory.filter(item => 
            (item.question && item.question.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
            (item.answer && item.answer.toLowerCase().includes(this.searchTerm.toLowerCase()))
        );
        
        if (filtered.length === 0) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-search"></i>
                    <p>未找到相关记录</p>
                    <button onclick="app.searchTerm=''; app.renderHistoryList()" style="margin-top:10px; padding:8px 16px; background:var(--primary); color:white; border:none; border-radius:4px; cursor:pointer;">
                        <i class="fas fa-times"></i> 清除搜索
                    </button>
                </div>
            `;
            return;
        }
        
        let html = '';
        filtered.forEach(item => {
            const question = item.question && item.question.length > 50 
                ? item.question.substring(0, 50) + '...' 
                : item.question || '空消息';
            
            let timeStr = '';
            if (item.created_at) {
                try {
                    const date = new Date(item.created_at);
                    timeStr = `${date.getMonth()+1}.${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
                } catch (e) {
                    timeStr = item.created_at;
                }
            }
            
            html += `
                <div class="history-item" data-id="${item.id}">
                    <h4 title="${this.escapeHtml(item.question || '')}">${this.escapeHtml(question)}</h4>
                    <div class="history-meta">
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        <button class="delete-history" onclick="app.deleteHistoryItem(${item.id}, event)">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        historyList.innerHTML = html;
    }

    // ============ 清空历史 ============
    async clearHistory() {
        if (!confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
            return;
        }
        
        try {
            const response = await fetch('/api/clear_history', { 
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('历史记录已清空', 'success');
                this.allHistory = [];
                this.currentConversationId = null;
                this.currentHistory = [];
                this.renderHistoryList();
                this.clearChat();
            } else {
                throw new Error(data.message || '清空失败');
            }
        } catch (error) {
            console.error('清空历史失败:', error);
            this.showToast('清空历史失败: ' + error.message, 'error');
        }
    }

    // ============ 删除单条历史 ============
    async deleteHistoryItem(id, event) {
        if (event) event.stopPropagation();
        
        if (!confirm('确定要删除这条记录吗？')) {
            return;
        }
        
        try {
            const response = await fetch('/api/history/' + id, { 
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('记录已删除', 'success');
                
                if (this.currentConversationId === id) {
                    this.clearChat();
                    this.currentConversationId = null;
                }
                
                this.loadHistory();
            } else {
                throw new Error(data.message || '删除失败');
            }
        } catch (error) {
            console.error('删除记录失败:', error);
            this.showToast('删除失败: ' + error.message, 'error');
        }
    }

    // ============ 刷新历史 ============
    refreshHistory() {
        this.loadHistory();
    }

    // ============ 清空聊天 ============
    clearChat() {
        const messages = document.getElementById('messages');
        if (messages) messages.innerHTML = '';
        
        const input = document.getElementById('questionInput');
        if (input) input.value = '';
        
        const tokenCount = document.getElementById('tokenCount');
        if (tokenCount) tokenCount.innerHTML = '<i class="fas fa-microchip"></i> Tokens: 0';
        
        const responseTime = document.getElementById('responseTime');
        if (responseTime) responseTime.innerHTML = '<i class="fas fa-clock"></i> 时间: --:--:--';
        
        this.currentConversationId = null;
        this.currentHistory = [];
    }

    // ============ 密码修改 ============
    showChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) {
            modal.classList.add('active');
            setTimeout(() => {
                const oldPassword = document.getElementById('oldPassword');
                if (oldPassword) oldPassword.focus();
            }, 100);
            
            // 清空输入框
            const oldPwd = document.getElementById('oldPassword');
            const newPwd = document.getElementById('newPassword');
            const confirmPwd = document.getElementById('confirmPassword');
            if (oldPwd) oldPwd.value = '';
            if (newPwd) newPwd.value = '';
            if (confirmPwd) confirmPwd.value = '';
        }
    }

    hideChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async changePassword() {
        const oldPassword = document.getElementById('oldPassword');
        const newPassword = document.getElementById('newPassword');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (!oldPassword || !newPassword || !confirmPassword) return;
        
        const oldPwd = oldPassword.value.trim();
        const newPwd = newPassword.value.trim();
        const confirmPwd = confirmPassword.value.trim();
        
        if (!oldPwd || !newPwd || !confirmPwd) {
            this.showToast('请填写所有字段', 'error');
            return;
        }
        
        if (newPwd.length < 6) {
            this.showToast('新密码至少6个字符', 'error');
            return;
        }
        
        if (newPwd !== confirmPwd) {
            this.showToast('两次输入的新密码不一致', 'error');
            return;
        }

        const btn = document.querySelector('#changePasswordModal .btn-primary');
        if (btn) {
            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';

            try {
                const response = await fetch('/change-password', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ 
                        old_password: oldPwd, 
                        new_password: newPwd 
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (data.success) {
                    this.showToast('密码修改成功', 'success');
                    this.hideChangePasswordModal();
                } else {
                    throw new Error(data.message || '修改失败');
                }
            } catch (error) {
                console.error('密码修改失败:', error);
                this.showToast('密码修改失败: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    // ============ Toast提示 ============
    showToast(message, type = 'info') {
        // 移除已存在的相同toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';
        
        toast.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// ============ 初始化应用 ============
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否是登录页
    if (document.querySelector('.login-page') || document.querySelector('.login-container')) {
        return; // 登录页不需要初始化ChatApp
    }
    
    // 确保所有需要的元素都存在
    if (document.getElementById('sendBtn') && document.getElementById('historyList')) {
        window.app = new ChatApp();
    } else {
        console.error('页面元素不完整，请检查HTML');
    }
});
