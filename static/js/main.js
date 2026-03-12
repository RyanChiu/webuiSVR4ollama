class ChatApp {
    constructor() {
        this.currentConversationId = null;
        this.currentHistory = [];
        this.allHistory = [];
        this.searchTerm = '';
        this.isThinking = false;
        this.csrfToken = this.getCsrfToken();
        this.init();
    }

    getCsrfToken() {
        const tokenMeta = document.querySelector('meta[name="csrf-token"]');
        return tokenMeta ? tokenMeta.getAttribute('content') : '';
    }

    withCsrfHeaders(headers = {}) {
        if (!this.csrfToken) return headers;
        return {
            ...headers,
            'X-CSRF-Token': this.csrfToken
        };
    }

    init() {
        this.bindEvents();
        this.loadModels();
        this.loadHistory();
        this.loadUserInfo();
    }

    bindEvents() {
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
        
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

        const clearHistoryBtn = document.getElementById('clearHistory');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        }
        
        const refreshHistoryBtn = document.getElementById('refreshHistory');
        if (refreshHistoryBtn) {
            refreshHistoryBtn.addEventListener('click', () => this.refreshHistory());
        }

        const clearChatBtn = document.getElementById('clearChat');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => this.clearChat());
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (confirm('确定要退出登录吗？')) {
                    await this.logout();
                }
            });
        }

        const autoScroll = document.getElementById('autoScroll');
        if (autoScroll) {
            autoScroll.addEventListener('change', () => {
                if (autoScroll.checked) {
                    this.scrollToBottom();
                }
            });
        }
        
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

    loadMarkedLibrary() {
        // 不再加载任何外部CDN资源，保持离线可用。
        return;
    }

    renderMarkdown(text) {
        if (!text) return '';
        
        if (window.marked) {
            try {
                return marked.parse(text);
            } catch (e) {
                console.error('Markdown渲染失败:', e);
            }
        }
        
        // 简单渲染
        return text.replace(/\n/g, '<br>');
    }

    async loadUserInfo() {
        try {
            const response = await fetch('/api/user/info');
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
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
                    userRoleEl.innerHTML = `<i class="fas fa-clock"></i> 上次登录: ${lastLogin}`;
                }
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
            const userNameEl = document.getElementById('userName');
            const userRoleEl = document.getElementById('userRole');
            if (userNameEl) userNameEl.textContent = '加载失败';
            if (userRoleEl) userRoleEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 用户信息不可用';
        }
    }

    async loadModels() {
        const select = document.getElementById('modelSelect');
        if (!select) return;
        
        try {
            const response = await fetch('/api/models', {
                headers: { 'Accept': 'application/json' }
            });

            const raw = await response.text();
            let data = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch (parseError) {
                throw new Error(`响应解析失败（status=${response.status}）: ${raw.slice(0, 80)}`);
            }

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
            
            select.innerHTML = '';
            const previousModel = (select.dataset.selectedModel || '').trim();
            const modelList = Array.isArray(data.models) ? data.models : [];
            
            if (data.success && modelList.length > 0) {
                let selectedMatched = false;
                modelList.forEach(model => {
                    if (typeof model !== 'string' || !model.trim()) {
                        return;
                    }
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    if (previousModel && model === previousModel) {
                        option.selected = true;
                        selectedMatched = true;
                    }
                    select.appendChild(option);
                });
                if (!selectedMatched && select.options.length > 0) {
                    select.options[0].selected = true;
                }
                if (select.value) {
                    select.dataset.selectedModel = select.value;
                }
                console.log('✓ 模型加载成功:', modelList);
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无可用模型（请先在Ollama中安装）';
                option.selected = true;
                option.disabled = true;
                select.appendChild(option);
            }
        } catch (error) {
            console.error('加载模型失败:', error);
            select.innerHTML = '<option value="" selected disabled>无法获取模型列表</option>';
        }
    }

    async loadHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        try {
            const response = await fetch('/api/history?summary=1&limit=300');
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
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
                    <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
                    <p>加载失败: ${error.message}</p>
                    <button onclick="app.refreshHistory()" style="margin-top:15px; padding:8px 20px; background:var(--primary); color:white; border:none; border-radius:6px; cursor:pointer;">
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
                    <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p style="margin-top: 15px;">暂无历史记录</p>
                    <p style="font-size: 13px; color: var(--gray); margin-top: 8px;">开始聊天吧！</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        this.allHistory.forEach(item => {
            const conversationId = String(item.conversation_id || '');
            if (!conversationId) return;
            const question = item.question && item.question.length > 50 
                ? item.question.substring(0, 50) + '...' 
                : item.question || '空消息';
            
            let timeStr = '未知时间';
            if (item.created_at) {
                try {
                    const date = new Date(item.created_at);
                    timeStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                } catch (e) {
                    timeStr = item.created_at;
                }
            }
            
            const activeClass = this.currentConversationId === conversationId ? 'active' : '';
            const encodedConversationId = encodeURIComponent(conversationId);
            
            html += `
                <div class="history-item ${activeClass}" data-conversation-id="${this.escapeHtml(conversationId)}">
                    <h4 title="${this.escapeHtml(item.question || '')}">${this.escapeHtml(question)}</h4>
                    <div class="history-meta">
                        <span><i class="far fa-clock"></i> ${timeStr}</span>
                        <button class="delete-history" onclick="app.deleteHistoryItem('${encodedConversationId}', event)">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        historyList.innerHTML = html;
        this.bindHistoryItemClickEvents();
    }

    bindHistoryItemClickEvents() {
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-history')) {
                    const conversationId = (item.dataset.conversationId || '').trim();
                    if (conversationId) {
                        this.loadConversation(conversationId);
                    }
                }
            });
        });
    }

    async loadConversation(conversationId) {
        try {
            const response = await fetch('/api/conversations/' + encodeURIComponent(conversationId));
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.success) {
                const conversationHistory = Array.isArray(data.history) ? data.history : [];
                if (conversationHistory.length > 0) {
                    this.currentConversationId = conversationId;
                    this.currentHistory = [];

                    this.renderHistoryList();

                    const messagesContainer = document.getElementById('messages');
                    if (messagesContainer) {
                        messagesContainer.innerHTML = '';

                        conversationHistory.forEach(historyItem => {
                            this.displayMessage('question', historyItem.question || '', false);
                            if (historyItem.answer_html) {
                                this.displayMessage('answer', historyItem.answer_html, true);
                            } else {
                                const safeHtml = this.escapeHtml(historyItem.answer || '').replace(/\n/g, '<br>');
                                this.displayMessage('answer', safeHtml, true);
                            }
                            this.currentHistory.push(
                                { type: 'question', content: historyItem.question || '' },
                                { type: 'answer', content: historyItem.answer || '' }
                            );
                        });
                    }
                    
                    this.scrollToBottom();
                    
                    const input = document.getElementById('questionInput');
                    if (input) input.focus();
                }
            }
        } catch (error) {
            console.error('加载对话失败:', error);
            this.showToast('加载对话失败: ' + error.message, 'error');
        }
    }

    showThinking() {
        if (this.isThinking) return;
        this.isThinking = true;
        
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
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

    async sendMessage() {
        const input = document.getElementById('questionInput');
        if (!input) return;
        
        const question = input.value.trim();
        
        if (!question) {
            this.showToast('请输入问题', 'warning');
            return;
        }

        const modelSelect = document.getElementById('modelSelect');
        const model = modelSelect ? (modelSelect.value || '').trim() : '';
        if (!model) {
            this.showToast('请先在Ollama中安装并选择模型', 'warning');
            return;
        }
        if (modelSelect) {
            modelSelect.dataset.selectedModel = model;
        }
        
        this.displayMessage('question', question, false);
        input.value = '';
        
        this.showThinking();
        
        try {
            let prompt = question;
            if (this.currentConversationId && this.currentHistory.length > 0) {
                const context = this.currentHistory
                    .slice(-4)
                    .map(msg => (msg.type === 'question' ? '用户' : '助手') + ': ' + msg.content)
                    .join('\n');
                prompt = context + '\n用户: ' + question;
            }
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }),
                body: JSON.stringify({ 
                    question: prompt, 
                    model: model,
                    conversation_id: this.currentConversationId || ''
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            this.hideThinking();
            
            if (data.success) {
                const safeAnswerHtml = data.answer_html || this.escapeHtml(data.answer || '').replace(/\n/g, '<br>');
                this.displayMessage('answer', safeAnswerHtml, true);
                if (data.conversation_id) {
                    this.currentConversationId = String(data.conversation_id);
                }
                
                this.currentHistory.push(
                    { type: 'question', content: question },
                    { type: 'answer', content: data.answer }
                );
                
                await this.loadHistory();
                
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

    displayMessage(type, content, isHtml = false) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
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
        
        let formattedContent;
        if (isHtml) {
            formattedContent = content;
        } else {
            formattedContent = this.escapeHtml(content || '').replace(/\n/g, '<br>');
        }
        
        message.innerHTML = `
            <div class="message-header">
                <i class="fas ${icon}"></i>
                <strong>${header}</strong>
            </div>
            <div class="message-content markdown-body">${formattedContent}</div>
            <div class="message-footer">
                <i class="fas fa-clock"></i> ${timeStr}
            </div>
        `;
        
        this.addCopyButtons(message);
        messagesContainer.appendChild(message);
        
        const autoScroll = document.getElementById('autoScroll');
        if (autoScroll && autoScroll.checked) {
            this.scrollToBottom();
        }
    }

    addCopyButtons(element) {
        const codeBlocks = element.querySelectorAll('pre code');
        codeBlocks.forEach(codeBlock => {
            const pre = codeBlock.parentElement;
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-code-button';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.title = '复制代码';
            copyButton.onclick = (e) => {
                e.stopPropagation();
                this.copyToClipboard(codeBlock.textContent);
            };
            
            pre.style.position = 'relative';
            pre.appendChild(copyButton);
        });
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('代码已复制到剪贴板', 'success');
        }).catch(err => {
            console.error('复制失败:', err);
            this.showToast('复制失败', 'error');
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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

    scrollToBottom() {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

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
            (item.model && item.model.toLowerCase().includes(this.searchTerm.toLowerCase()))
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
            const conversationId = String(item.conversation_id || '');
            if (!conversationId) return;
            const encodedConversationId = encodeURIComponent(conversationId);
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
            
            const activeClass = this.currentConversationId === conversationId ? 'active' : '';
            html += `
                <div class="history-item ${activeClass}" data-conversation-id="${this.escapeHtml(conversationId)}">
                    <h4 title="${this.escapeHtml(item.question || '')}">${this.escapeHtml(question)}</h4>
                    <div class="history-meta">
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        <button class="delete-history" onclick="app.deleteHistoryItem('${encodedConversationId}', event)">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        historyList.innerHTML = html;
        this.bindHistoryItemClickEvents();
    }

    async clearHistory() {
        if (!confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
            return;
        }
        
        try {
            const response = await fetch('/api/clear_history', { 
                method: 'DELETE',
                headers: this.withCsrfHeaders({
                    'Accept': 'application/json'
                })
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

    async deleteHistoryItem(conversationIdEncoded, event) {
        if (event) event.stopPropagation();
        const conversationId = decodeURIComponent(conversationIdEncoded || '').trim();
        if (!conversationId) return;
        
        if (!confirm('确定要删除这条记录吗？')) {
            return;
        }
        
        try {
            const response = await fetch('/api/conversations/' + encodeURIComponent(conversationId), { 
                method: 'DELETE',
                headers: this.withCsrfHeaders({
                    'Accept': 'application/json'
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('记录已删除', 'success');
                
                if (this.currentConversationId === conversationId) {
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

    refreshHistory() {
        this.loadHistory();
    }

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

    showChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) {
            modal.classList.add('active');
            setTimeout(() => {
                const oldPassword = document.getElementById('oldPassword');
                if (oldPassword) oldPassword.focus();
            }, 100);
            
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
                    headers: this.withCsrfHeaders({
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }),
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

    async logout() {
        try {
            const response = await fetch('/logout', {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Accept': 'application/json'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                window.location.href = data.redirect || '/login';
            } else {
                throw new Error(data.message || '退出登录失败');
            }
        } catch (error) {
            console.error('退出登录失败:', error);
            this.showToast('退出登录失败: ' + error.message, 'error');
        }
    }

    showToast(message, type = 'info') {
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

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    if (document.querySelector('.login-page') || document.querySelector('.login-container')) {
        return;
    }
    
    if (document.getElementById('sendBtn') && document.getElementById('historyList')) {
        window.app = new ChatApp();
    } else {
        console.error('页面元素不完整，请检查HTML');
    }
});
