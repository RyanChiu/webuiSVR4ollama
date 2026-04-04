class ChatApp {
    constructor() {
        this.currentConversationId = null;
        this.currentHistory = [];
        this.allHistory = [];
        this.rules = [];
        this.ruleReplaceTargetId = null;
        this.currentRuleReviewId = null;
        this.currentRuleReviewRule = null;
        this.currentRuleReviewMessages = [];
        this.ruleReviewCache = {};
        this.isRuleReviewBusy = false;
        this.ruleReviewBusyLabel = 'AI审查中...';
        this.currentRuleVersionGroupId = '';
        this.ruleVersionItems = [];
        this.pendingAttachments = [];
        this.isUploadingAttachments = false;
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
        this.renderPendingAttachments();
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
            clearChatBtn.addEventListener('click', () => this.startNewConversation());
        }

        const attachBtn = document.getElementById('attachBtn');
        if (attachBtn) {
            attachBtn.addEventListener('click', () => this.openAttachmentPicker());
        }

        const attachmentInput = document.getElementById('attachmentInput');
        if (attachmentInput) {
            attachmentInput.addEventListener('change', (e) => this.uploadSelectedAttachments(e));
        }

        const exportConversationBtn = document.getElementById('exportConversation');
        if (exportConversationBtn) {
            exportConversationBtn.addEventListener('click', () => this.exportCurrentConversation());
        }

        const openRulesBtn = document.getElementById('openRulesBtn');
        if (openRulesBtn) {
            openRulesBtn.addEventListener('click', () => this.showRulesModal());
        }

        const uploadRulesBtn = document.getElementById('uploadRulesBtn');
        if (uploadRulesBtn) {
            uploadRulesBtn.addEventListener('click', () => this.openRuleUploadPicker());
        }

        const refreshRulesBtn = document.getElementById('refreshRulesBtn');
        if (refreshRulesBtn) {
            refreshRulesBtn.addEventListener('click', () => this.loadRules());
        }

        const ruleFilesInput = document.getElementById('ruleFilesInput');
        if (ruleFilesInput) {
            ruleFilesInput.addEventListener('change', (e) => this.uploadRuleFiles(e, null));
        }

        const ruleReplaceInput = document.getElementById('ruleReplaceInput');
        if (ruleReplaceInput) {
            ruleReplaceInput.addEventListener('change', (e) => this.uploadRuleFiles(e, this.ruleReplaceTargetId));
        }

        const ruleReviewInput = document.getElementById('ruleReviewInput');
        if (ruleReviewInput) {
            ruleReviewInput.addEventListener('keydown', (e) => {
                const isCtrlEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
                if (isCtrlEnter) {
                    e.preventDefault();
                    this.sendRuleReviewMessage();
                }
            });
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

    showRulesModal() {
        const modal = document.getElementById('rulesModal');
        if (modal) {
            modal.classList.add('active');
            this.loadRules();
        }
    }

    hideRulesModal() {
        const modal = document.getElementById('rulesModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    showRuleVersionsModal(ruleId) {
        const id = Number(ruleId || 0);
        if (!id) return;
        this.hideRulesModal();
        const modal = document.getElementById('ruleVersionsModal');
        if (modal) {
            modal.classList.add('active');
        }
        this.loadRuleVersions(id);
    }

    hideRuleVersionsModal() {
        const modal = document.getElementById('ruleVersionsModal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.currentRuleVersionGroupId = '';
        this.ruleVersionItems = [];
        this.showRulesModal();
    }

    showRuleReviewModal(ruleId) {
        const id = Number(ruleId || 0);
        if (!id) return;
        this.hideRulesModal();
        this.currentRuleReviewId = id;
        const cached = this.ruleReviewCache[String(id)] || null;
        const input = document.getElementById('ruleReviewInput');
        if (cached && Array.isArray(cached.messages)) {
            this.currentRuleReviewMessages = cached.messages.slice();
            this.currentRuleReviewRule = cached.rule || null;
            this.renderRuleReviewMessages();
            this.updateRuleReviewHeader(this.currentRuleReviewRule);
            if (input) {
                input.value = cached.draftText || '';
            }
        } else {
            this.currentRuleReviewMessages = [];
            this.currentRuleReviewRule = null;
            if (input) {
                input.value = '';
            }
        }
        const modal = document.getElementById('ruleReviewModal');
        if (modal) {
            modal.classList.add('active');
        }
        this.loadRuleReviewMessages(!cached);
    }

    hideRuleReviewModal() {
        this.persistRuleReviewCache();
        const modal = document.getElementById('ruleReviewModal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.currentRuleReviewId = null;
    }

    updateRuleReviewHeader(rule) {
        const header = document.getElementById('ruleReviewHeader');
        if (!header) return;
        if (!rule) {
            this.currentRuleReviewRule = null;
            header.textContent = '未选择规则';
            return;
        }
        this.currentRuleReviewRule = rule;
        const status = this.getRuleStatusLabel(rule.status);
        const activeText = rule.is_active ? '已启用' : '未启用';
        header.textContent = `规则：${rule.name || ''} (v${Number(rule.version || 1)}) · 状态：${status} · ${activeText}`;
    }

    persistRuleReviewCache() {
        if (!this.currentRuleReviewId) return;
        const input = document.getElementById('ruleReviewInput');
        this.ruleReviewCache[String(this.currentRuleReviewId)] = {
            messages: Array.isArray(this.currentRuleReviewMessages) ? this.currentRuleReviewMessages.slice() : [],
            rule: this.currentRuleReviewRule || null,
            draftText: input ? (input.value || '') : ''
        };
    }

    setRuleReviewBusyState(isBusy, label = 'AI审查中...') {
        this.isRuleReviewBusy = Boolean(isBusy);
        this.ruleReviewBusyLabel = label || 'AI审查中...';
        const sendBtn = document.getElementById('reviewSendBtn');
        const verdictBtn = document.getElementById('reviewVerdictBtn');
        const input = document.getElementById('ruleReviewInput');
        if (sendBtn) sendBtn.disabled = this.isRuleReviewBusy;
        if (verdictBtn) verdictBtn.disabled = this.isRuleReviewBusy;
        if (input) input.disabled = this.isRuleReviewBusy;
        this.renderRuleReviewMessages();
    }

    mergeRuleReviewMessages(items) {
        const incoming = Array.isArray(items) ? items : [];
        const merged = Array.isArray(this.currentRuleReviewMessages) ? this.currentRuleReviewMessages.slice() : [];
        const seenIds = new Set(
            merged
                .map(item => Number(item && item.id ? item.id : 0))
                .filter(id => id > 0)
        );
        incoming.forEach((item) => {
            const id = Number(item && item.id ? item.id : 0);
            if (id > 0 && seenIds.has(id)) {
                return;
            }
            if (id > 0) {
                seenIds.add(id);
            }
            merged.push(item);
        });
        this.currentRuleReviewMessages = merged;
    }

    renderRuleReviewMessages() {
        const container = document.getElementById('ruleReviewChat');
        if (!container) return;
        const hasMessages = Array.isArray(this.currentRuleReviewMessages) && this.currentRuleReviewMessages.length > 0;
        if (!hasMessages && !this.isRuleReviewBusy) {
            container.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-info-circle"></i>
                    <p>还没有审核对话，先发一条消息开始。</p>
                </div>
            `;
            return;
        }

        let html = '';
        (this.currentRuleReviewMessages || []).forEach((item) => {
            const role = String(item.role || 'assistant');
            const type = role === 'user' ? 'question' : 'answer';
            const roleLabel = role === 'user' ? '您' : 'AI审查助手';
            const icon = role === 'user' ? 'fa-user' : 'fa-robot';
            const contentRaw = String(item.content || '');
            const contentHtml = this.renderImmediateMarkdown(contentRaw);
            const time = this.escapeHtml(item.created_at || '');
            const reviewRuleId = Number(item.rule_id || this.currentRuleReviewId || 0);
            const reviewMsgId = Number(item.id || 0);
            let actionsHtml = '';
            if (role === 'assistant' && reviewRuleId > 0 && reviewMsgId > 0) {
                const encodedRuleId = encodeURIComponent(String(reviewRuleId));
                const encodedMsgId = encodeURIComponent(String(reviewMsgId));
                actionsHtml = `
                    <span class="message-actions review-msg-actions">
                        <a href="#" onclick="app.downloadRuleReviewMessage('${encodedRuleId}', '${encodedMsgId}', 'md', event)">下载修订稿MD</a>
                        <a href="#" onclick="app.downloadRuleReviewMessage('${encodedRuleId}', '${encodedMsgId}', 'txt', event)">TXT</a>
                    </span>
                `;
            }
            html += `
                <div class="message ${type}">
                    <div class="message-header">
                        <i class="fas ${icon}"></i>
                        <strong>${roleLabel}</strong>
                    </div>
                    <div class="message-content markdown-body">${contentHtml}</div>
                    <div class="message-footer">
                        <i class="fas fa-clock"></i> ${time}
                        ${actionsHtml}
                    </div>
                </div>
            `;
        });

        if (this.isRuleReviewBusy) {
            html += `
                <div class="message answer thinking-message review-thinking">
                    <div class="message-header">
                        <i class="fas fa-robot"></i>
                        <strong>AI审查助手</strong>
                    </div>
                    <div class="message-content thinking-content">
                        <i class="fas fa-spinner fa-spin"></i> ${this.escapeHtml(this.ruleReviewBusyLabel || 'AI审查中...')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        container.querySelectorAll('.message').forEach(msgEl => this.addCopyButtons(msgEl));
        container.scrollTop = container.scrollHeight;
    }

    async loadRuleReviewMessages(initial = false) {
        if (!this.currentRuleReviewId) return;
        const container = document.getElementById('ruleReviewChat');
        if (initial && container) {
            container.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>加载审核对话中...</p>
                </div>
            `;
        }
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(this.currentRuleReviewId))}/review/messages`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || '加载审核对话失败');
            }
            this.updateRuleReviewHeader(data.rule || null);
            this.currentRuleReviewMessages = Array.isArray(data.messages) ? data.messages : [];
            this.renderRuleReviewMessages();
            this.persistRuleReviewCache();
            if (initial && this.currentRuleReviewMessages.length === 0) {
                await this.requestInitialRuleReview();
            }
        } catch (error) {
            console.error('加载规则审核对话失败:', error);
            if (this.currentRuleReviewMessages && this.currentRuleReviewMessages.length > 0) {
                this.showToast('审核对话刷新失败，已显示本地缓存', 'warning');
                return;
            }
            if (container) {
                container.innerHTML = `
                    <div class="empty-history">
                        <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
                        <p>加载失败: ${this.escapeHtml(error.message || '')}</p>
                    </div>
                `;
            }
        }
    }

    async requestInitialRuleReview() {
        if (!this.currentRuleReviewId || this.isRuleReviewBusy) return;
        const modelSelect = document.getElementById('modelSelect');
        const model = modelSelect ? (modelSelect.value || '').trim() : '';
        if (!model) return;

        this.setRuleReviewBusyState(true, 'AI正在进行首轮审核...');
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(this.currentRuleReviewId))}/review/messages`, {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }),
                body: JSON.stringify({ message: '', model })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                return;
            }
            const newMsgs = Array.isArray(data.messages) ? data.messages : [];
            if (newMsgs.length > 0) {
                this.mergeRuleReviewMessages(newMsgs);
                this.renderRuleReviewMessages();
                this.updateRuleReviewHeader(data.rule || null);
                this.persistRuleReviewCache();
                await this.loadRules();
            }
        } catch (error) {
            console.error('生成初始规则审核失败:', error);
        } finally {
            this.setRuleReviewBusyState(false);
        }
    }

    async sendRuleReviewMessage() {
        if (!this.currentRuleReviewId || this.isRuleReviewBusy) return;
        const input = document.getElementById('ruleReviewInput');
        if (!input) return;
        const text = (input.value || '').trim();
        if (!text) {
            this.showToast('请输入审核问题或修改要求', 'warning');
            return;
        }

        const modelSelect = document.getElementById('modelSelect');
        const model = modelSelect ? (modelSelect.value || '').trim() : '';
        if (!model) {
            this.showToast('请先选择模型', 'warning');
            return;
        }

        const tempMessageId = `local-${Date.now()}`;
        this.currentRuleReviewMessages.push({
            id: tempMessageId,
            rule_id: this.currentRuleReviewId,
            role: 'user',
            content: text,
            created_at: '刚刚'
        });
        input.value = '';
        this.renderRuleReviewMessages();
        this.persistRuleReviewCache();
        this.setRuleReviewBusyState(true, 'AI审查中...');
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(this.currentRuleReviewId))}/review/messages`, {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }),
                body: JSON.stringify({ message: text, model })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error((data && data.message) || `HTTP error! status: ${response.status}`);
            }
            this.currentRuleReviewMessages = this.currentRuleReviewMessages.filter(
                item => String(item.id || '') !== tempMessageId
            );
            const newMsgs = Array.isArray(data.messages) ? data.messages : [];
            this.mergeRuleReviewMessages(newMsgs);
            this.renderRuleReviewMessages();
            this.updateRuleReviewHeader(data.rule || null);
            this.persistRuleReviewCache();
            await this.loadRules();
        } catch (error) {
            console.error('发送规则审核消息失败:', error);
            this.currentRuleReviewMessages = this.currentRuleReviewMessages.filter(
                item => String(item.id || '') !== tempMessageId
            );
            if (!input.value.trim()) {
                input.value = text;
                input.focus();
            }
            this.renderRuleReviewMessages();
            this.showToast('发送失败: ' + error.message, 'error');
        } finally {
            this.persistRuleReviewCache();
            this.setRuleReviewBusyState(false);
        }
    }

    async requestRuleReviewVerdict() {
        if (!this.currentRuleReviewId || this.isRuleReviewBusy) return;
        const modelSelect = document.getElementById('modelSelect');
        const model = modelSelect ? (modelSelect.value || '').trim() : '';
        if (!model) {
            this.showToast('请先选择模型', 'warning');
            return;
        }

        this.setRuleReviewBusyState(true, 'AI正在判定是否通过...');
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(this.currentRuleReviewId))}/review/evaluate`, {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }),
                body: JSON.stringify({ model })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error((data && data.message) || `HTTP error! status: ${response.status}`);
            }
            if (data.message) {
                this.mergeRuleReviewMessages([data.message]);
            }
            this.renderRuleReviewMessages();
            this.updateRuleReviewHeader(data.rule || null);
            this.persistRuleReviewCache();
            this.showToast(data.verdict && data.verdict.pass ? 'AI判定：可通过' : 'AI判定：仍需修改', data.verdict && data.verdict.pass ? 'success' : 'warning');
            await this.loadRules();
        } catch (error) {
            console.error('规则通过判定失败:', error);
            this.showToast('判定失败: ' + error.message, 'error');
        } finally {
            this.setRuleReviewBusyState(false);
        }
    }

    openRuleUploadPicker() {
        this.ruleReplaceTargetId = null;
        const input = document.getElementById('ruleFilesInput');
        if (input) {
            input.click();
        }
    }

    openRuleReplacePicker(ruleId, event) {
        if (event) event.stopPropagation();
        this.ruleReplaceTargetId = ruleId;
        const input = document.getElementById('ruleReplaceInput');
        if (input) {
            input.value = '';
            input.click();
        }
    }

    getRuleStatusLabel(status) {
        const mapping = {
            draft: '草稿',
            ai_review_failed: 'AI未通过',
            ai_review_passed: 'AI通过待确认',
            confirmed: '已确认'
        };
        return mapping[status] || status || '草稿';
    }

    renderRulesList() {
        const list = document.getElementById('rulesList');
        if (!list) return;
        if (!this.rules || this.rules.length === 0) {
            list.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-inbox"></i>
                    <p>暂无规则，请先上传</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.rules.forEach((rule) => {
            const status = String(rule.status || 'draft');
            const canConfirm = status === 'ai_review_passed';
            const canToggleActive = status === 'confirmed';
            const activeLabel = rule.is_active ? '停用' : '启用';
            const activeValue = rule.is_active ? '0' : '1';
            const summary = (rule.ai_review_summary || '').trim();
            const reviewCount = Number(rule.review_message_count || 0);
            html += `
                <div class="rule-item">
                    <div class="rule-header">
                        <div class="rule-name">${this.escapeHtml(rule.name || 'Unnamed')} (v${Number(rule.version || 1)})</div>
                        <div class="rule-status status-${this.escapeHtml(status)}">
                            ${this.escapeHtml(this.getRuleStatusLabel(status))}${rule.is_active ? ' · 已启用' : ''}
                        </div>
                    </div>
                    <div class="rule-meta">更新时间: ${this.escapeHtml(rule.updated_at || rule.created_at || '')} · 审核对话: ${reviewCount} 条</div>
                    ${summary ? `<div class="rule-summary">${this.escapeHtml(summary)}</div>` : ''}
                    <div class="rule-actions">
                        <button onclick="app.showRuleReviewModal(${Number(rule.id)})">进入审核对话</button>
                        <button onclick="app.downloadRuleDocument(${Number(rule.id)}, 'md', event)">下载MD</button>
                        <button onclick="app.showRuleVersionsModal(${Number(rule.id)})">版本管理</button>
                        <button onclick="app.confirmRule(${Number(rule.id)})" ${canConfirm ? '' : 'disabled'}>确认规则</button>
                        <button onclick="app.toggleRuleActive(${Number(rule.id)}, ${activeValue})" ${canToggleActive ? '' : 'disabled'}>${activeLabel}</button>
                        <button onclick="app.openRuleReplacePicker(${Number(rule.id)}, event)">修订上传</button>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    downloadRuleDocument(ruleId, format = 'md', event) {
        if (event) event.preventDefault();
        const id = String(ruleId || '').trim();
        if (!id) return;
        const safeFormat = ['md', 'txt', 'json'].includes(format) ? format : 'md';
        const link = document.createElement('a');
        link.href = `/api/rules/${encodeURIComponent(id)}/download?format=${safeFormat}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async loadRuleVersions(ruleId) {
        const list = document.getElementById('ruleVersionsList');
        const header = document.getElementById('ruleVersionsHeader');
        if (list) {
            list.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>加载版本中...</p>
                </div>
            `;
        }
        if (header) {
            header.textContent = '加载中...';
        }
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(ruleId))}/versions`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || '加载版本失败');
            }
            this.currentRuleVersionGroupId = String(data.rule_group_id || '');
            this.ruleVersionItems = Array.isArray(data.versions) ? data.versions : [];

            if (header) {
                const current = this.ruleVersionItems.find(item => Boolean(item.is_current));
                const name = current ? (current.name || 'Unnamed') : '规则';
                header.textContent = `${name} · 共 ${this.ruleVersionItems.length} 个版本`;
            }
            if (!list) return;
            if (this.ruleVersionItems.length === 0) {
                list.innerHTML = `
                    <div class="empty-history">
                        <i class="fas fa-inbox"></i>
                        <p>暂无版本</p>
                    </div>
                `;
                return;
            }

            let html = '';
            this.ruleVersionItems.forEach((item) => {
                const status = String(item.status || 'draft');
                const currentTag = item.is_current ? ' · 当前版本' : '';
                const activeTag = item.is_active ? ' · 已启用' : '';
                const reviewCount = Number(item.review_message_count || 0);
                html += `
                    <div class="rule-item">
                        <div class="rule-header">
                            <div class="rule-name">${this.escapeHtml(item.name || 'Unnamed')} (v${Number(item.version || 1)})</div>
                            <div class="rule-status status-${this.escapeHtml(status)}">${this.escapeHtml(this.getRuleStatusLabel(status))}${currentTag}${activeTag}</div>
                        </div>
                        <div class="rule-meta">更新时间: ${this.escapeHtml(item.updated_at || item.created_at || '')} · 审核对话: ${reviewCount} 条</div>
                        <div class="rule-actions">
                            <button onclick="app.downloadRuleDocument(${Number(item.id)}, 'md', event)">下载MD</button>
                            <button onclick="app.downloadRuleDocument(${Number(item.id)}, 'txt', event)">TXT</button>
                            <button onclick="app.setCurrentRuleVersion(${Number(item.id)})" ${item.is_current ? 'disabled' : ''}>切换为当前</button>
                        </div>
                    </div>
                `;
            });
            list.innerHTML = html;
        } catch (error) {
            console.error('加载规则版本失败:', error);
            if (header) header.textContent = '加载失败';
            if (list) {
                list.innerHTML = `
                    <div class="empty-history">
                        <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
                        <p>加载失败: ${this.escapeHtml(error.message || '')}</p>
                    </div>
                `;
            }
        }
    }

    async setCurrentRuleVersion(ruleId) {
        if (!ruleId) return;
        if (!confirm('确定切换到这个版本作为当前版本吗？')) {
            return;
        }
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(ruleId))}/set-current`, {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Accept': 'application/json'
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error((data && data.message) || `HTTP error! status: ${response.status}`);
            }
            this.showToast(data.message || '版本切换成功', 'success');
            await this.loadRules();
            await this.loadRuleVersions(ruleId);
        } catch (error) {
            console.error('切换规则版本失败:', error);
            this.showToast('切换版本失败: ' + error.message, 'error');
        }
    }

    async loadRules() {
        const list = document.getElementById('rulesList');
        if (list) {
            list.innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>加载规则中...</p>
                </div>
            `;
        }
        try {
            const response = await fetch('/api/rules');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || '加载规则失败');
            }
            this.rules = Array.isArray(data.rules) ? data.rules : [];
            this.renderRulesList();
        } catch (error) {
            console.error('加载规则失败:', error);
            if (list) {
                list.innerHTML = `
                    <div class="empty-history">
                        <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
                        <p>加载失败: ${this.escapeHtml(error.message || '')}</p>
                    </div>
                `;
            }
        }
    }

    async uploadRuleFiles(event, replaceRuleId) {
        const input = event && event.target ? event.target : null;
        if (!input || !input.files || input.files.length === 0) return;
        const files = Array.from(input.files);
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        if (replaceRuleId) {
            formData.append('replace_rule_id', String(replaceRuleId));
        }
        const uploadBtn = document.getElementById('uploadRulesBtn');
        if (uploadBtn) uploadBtn.disabled = true;
        this.setUploadProgress('rule', true, 0, `准备上传 ${files.length} 个规则文件...`);

        try {
            const data = await this.uploadWithProgress('/api/rules/upload', formData, (percent) => {
                if (typeof percent === 'number') {
                    this.setUploadProgress('rule', true, percent, `规则文件上传中 ${percent}%`);
                } else {
                    this.setUploadProgress('rule', true, 100, '规则文件上传中...');
                }
            });
            if (!data.success) {
                throw new Error(data.message || '规则上传失败');
            }
            this.setUploadProgress('rule', true, 100, '规则上传完成，处理中...');

            const failed = Array.isArray(data.errors) ? data.errors : [];
            if (failed.length > 0) {
                this.showToast(`上传完成，${failed.length} 个失败`, 'warning');
            } else {
                this.showToast('规则上传成功', 'success');
            }
            await this.loadRules();
        } catch (error) {
            console.error('上传规则失败:', error);
            this.showToast('上传规则失败: ' + error.message, 'error');
        } finally {
            if (uploadBtn) uploadBtn.disabled = false;
            input.value = '';
            this.ruleReplaceTargetId = null;
            setTimeout(() => {
                this.setUploadProgress('rule', false, 0, '准备上传规则文件...');
            }, 450);
        }
    }

    async confirmRule(ruleId) {
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(ruleId))}/confirm`, {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Accept': 'application/json'
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error((data && data.message) || `HTTP error! status: ${response.status}`);
            }
            this.showToast('规则已确认', 'success');
            await this.loadRules();
        } catch (error) {
            console.error('确认规则失败:', error);
            this.showToast('确认失败: ' + error.message, 'error');
        }
    }

    async toggleRuleActive(ruleId, nextActive) {
        try {
            const response = await fetch(`/api/rules/${encodeURIComponent(String(ruleId))}/active`, {
                method: 'POST',
                headers: this.withCsrfHeaders({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }),
                body: JSON.stringify({ active: Boolean(Number(nextActive)) })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error((data && data.message) || `HTTP error! status: ${response.status}`);
            }
            this.showToast(Boolean(Number(nextActive)) ? '规则已启用' : '规则已停用', 'success');
            await this.loadRules();
        } catch (error) {
            console.error('启停规则失败:', error);
            this.showToast('操作失败: ' + error.message, 'error');
        }
    }

    openAttachmentPicker() {
        const input = document.getElementById('attachmentInput');
        if (input) {
            input.click();
        }
    }

    formatFileSize(sizeBytes) {
        const size = Number(sizeBytes || 0);
        if (size < 1024) return `${size}B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
        return `${(size / (1024 * 1024)).toFixed(1)}MB`;
    }

    setUploadProgress(prefix, active, percent = 0, label = '') {
        const progressEl = document.getElementById(`${prefix}UploadProgress`);
        const barEl = document.getElementById(`${prefix}UploadBar`);
        const labelEl = document.getElementById(`${prefix}UploadLabel`);
        if (!progressEl || !barEl || !labelEl) return;

        if (active) {
            progressEl.classList.add('active');
        } else {
            progressEl.classList.remove('active');
        }

        const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
        barEl.style.width = `${safePercent}%`;
        labelEl.textContent = label || `上传中 ${safePercent}%`;
    }

    uploadWithProgress(url, formData, onProgress = null) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.responseType = 'json';
            xhr.setRequestHeader('Accept', 'application/json');
            if (this.csrfToken) {
                xhr.setRequestHeader('X-CSRF-Token', this.csrfToken);
            }

            xhr.upload.onprogress = (event) => {
                if (typeof onProgress !== 'function') return;
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    onProgress(percent, event.loaded, event.total);
                } else {
                    onProgress(null, event.loaded, 0);
                }
            };

            xhr.onerror = () => reject(new Error('网络错误'));
            xhr.onload = () => {
                const data = xhr.response || {};
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                    return;
                }
                reject(new Error(data.message || `HTTP error! status: ${xhr.status}`));
            };
            xhr.send(formData);
        });
    }

    renderPendingAttachments() {
        const list = document.getElementById('attachmentList');
        if (!list) return;

        if (!this.pendingAttachments || this.pendingAttachments.length === 0) {
            list.innerHTML = '';
            return;
        }

        let html = '';
        this.pendingAttachments.forEach((item) => {
            const encodedId = encodeURIComponent(String(item.id || ''));
            const name = item.original_name || 'unnamed';
            html += `
                <div class="attachment-item">
                    <i class="fas fa-paperclip"></i>
                    <span class="name" title="${this.escapeHtml(name)}">${this.escapeHtml(name)}</span>
                    <span>${this.formatFileSize(item.size_bytes || 0)}</span>
                    <button class="remove" onclick="app.removePendingAttachment('${encodedId}', event)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    removePendingAttachment(encodedId, event) {
        if (event) event.stopPropagation();
        const id = decodeURIComponent(encodedId || '');
        this.pendingAttachments = this.pendingAttachments.filter(item => String(item.id) !== String(id));
        this.renderPendingAttachments();
    }

    clearPendingAttachments() {
        this.pendingAttachments = [];
        this.renderPendingAttachments();
        const input = document.getElementById('attachmentInput');
        if (input) {
            input.value = '';
        }
    }

    async uploadSelectedAttachments(event) {
        const input = event && event.target ? event.target : document.getElementById('attachmentInput');
        if (!input || !input.files || input.files.length === 0) return;
        if (this.isUploadingAttachments) {
            this.showToast('附件上传中，请稍候', 'info');
            return;
        }

        const files = Array.from(input.files);
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        const attachBtn = document.getElementById('attachBtn');
        if (attachBtn) attachBtn.disabled = true;
        this.setUploadProgress('attachment', true, 0, `准备上传 ${files.length} 个附件...`);

        this.isUploadingAttachments = true;
        try {
            const data = await this.uploadWithProgress('/api/attachments', formData, (percent) => {
                if (typeof percent === 'number') {
                    this.setUploadProgress('attachment', true, percent, `附件上传中 ${percent}%`);
                } else {
                    this.setUploadProgress('attachment', true, 100, '附件上传中...');
                }
            });
            if (!data.success) {
                throw new Error(data.message || '附件上传失败');
            }
            this.setUploadProgress('attachment', true, 100, '附件上传完成，处理中...');

            const attachments = Array.isArray(data.attachments) ? data.attachments : [];
            attachments.forEach(item => {
                if (!this.pendingAttachments.some(existing => String(existing.id) === String(item.id))) {
                    this.pendingAttachments.push(item);
                }
            });
            this.renderPendingAttachments();

            const failed = Array.isArray(data.errors) ? data.errors : [];
            if (failed.length > 0) {
                this.showToast(`部分上传失败（${failed.length}个）`, 'warning');
            } else {
                this.showToast(`上传成功（${attachments.length}个）`, 'success');
            }
        } catch (error) {
            console.error('上传附件失败:', error);
            this.showToast('上传失败: ' + error.message, 'error');
        } finally {
            this.isUploadingAttachments = false;
            if (attachBtn) attachBtn.disabled = false;
            input.value = '';
            setTimeout(() => {
                this.setUploadProgress('attachment', false, 0, '准备上传...');
            }, 450);
        }
    }

    downloadRuleReviewMessage(ruleIdEncoded, messageIdEncoded, format = 'md', event) {
        if (event) event.preventDefault();
        const ruleId = decodeURIComponent(String(ruleIdEncoded || '')).trim();
        const messageId = decodeURIComponent(String(messageIdEncoded || '')).trim();
        if (!ruleId || !messageId) return;
        const safeFormat = ['md', 'txt', 'json'].includes(format) ? format : 'md';
        const link = document.createElement('a');
        link.href = `/api/rules/${encodeURIComponent(ruleId)}/review/messages/${encodeURIComponent(messageId)}/download?format=${safeFormat}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    downloadMessage(historyId, format = 'md', event) {
        if (event) event.preventDefault();
        const id = String(historyId || '').trim();
        if (!id) return;
        const safeFormat = ['md', 'txt', 'json'].includes(format) ? format : 'md';
        const link = document.createElement('a');
        link.href = `/api/messages/${encodeURIComponent(id)}/download?format=${safeFormat}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    exportCurrentConversation(format = 'md') {
        if (!this.currentConversationId) {
            this.showToast('请先打开一个会话再导出', 'warning');
            return;
        }
        const safeFormat = ['md', 'txt', 'json'].includes(format) ? format : 'md';
        const link = document.createElement('a');
        link.href = `/api/conversations/${encodeURIComponent(this.currentConversationId)}/export?format=${safeFormat}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
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
            const title = item.title || item.conversation_title || item.question || '未命名对话';
            const displayTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
            
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
                    <h4 title="${this.escapeHtml(title)}">${this.escapeHtml(displayTitle)}</h4>
                    <div class="history-meta">
                        <span><i class="far fa-clock"></i> ${timeStr}</span>
                        <div class="history-actions">
                            <button class="rename-history" onclick="app.renameConversationItem('${encodedConversationId}', event)">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="delete-history" onclick="app.deleteHistoryItem('${encodedConversationId}', event)">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
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
                            if (historyItem.question_html) {
                                this.displayMessage('question', historyItem.question_html, true);
                            } else {
                                this.displayMessage('question', historyItem.question || '', false);
                            }
                            const safeHtml = this.normalizeAnswerHtml(historyItem.answer_html, historyItem.answer);
                            this.displayMessage('answer', safeHtml, true, { historyId: historyItem.id });
                            this.currentHistory.push(
                                { type: 'question', content: historyItem.question || '' },
                                { type: 'answer', content: historyItem.answer || '' }
                            );
                        });
                    }
                    
                    this.scrollToBottom();
                    
                    const input = document.getElementById('questionInput');
                    if (input) input.focus();
                    this.showToast('已载入历史会话', 'info');
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
                <i class="fas fa-circle-notch thinking-spinner" aria-hidden="true"></i>
                <span class="thinking-text">正在思考...</span>
            </div>
        `;
        
        messagesContainer.appendChild(thinkingMessage);
        this.scrollToBottom();
    }

    hideThinking() {
        this.isThinking = false;
        const thinkingMessage = document.getElementById('thinking-message');
        if (thinkingMessage) {
            thinkingMessage.remove();
        }
    }

    async sendMessage() {
        const input = document.getElementById('questionInput');
        if (!input) return;
        
        const question = input.value.trim();
        const originalQuestion = question;
        
        if (!question) {
            this.showToast('请输入问题', 'warning');
            return;
        }
        if (this.isUploadingAttachments) {
            this.showToast('附件仍在上传，请稍候', 'warning');
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
        
        const questionMessage = this.displayMessage('question', question, false);
        if (questionMessage) {
            const questionContentEl = questionMessage.querySelector('.message-content');
            if (questionContentEl) {
                questionContentEl.innerHTML = this.renderImmediateMarkdown(question);
                this.addCopyButtons(questionMessage);
            }
        }
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
                    question: question,
                    prompt: prompt,
                    model: model,
                    conversation_id: this.currentConversationId || '',
                    attachment_ids: this.pendingAttachments.map(item => item.id)
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            this.hideThinking();
            
            if (data.success) {
                if (questionMessage && data.question_html) {
                    const questionContentEl = questionMessage.querySelector('.message-content');
                    if (questionContentEl) {
                        questionContentEl.innerHTML = data.question_html;
                        this.addCopyButtons(questionMessage);
                    }
                }
                const safeAnswerHtml = this.normalizeAnswerHtml(data.answer_html, data.answer);
                this.displayMessage('answer', safeAnswerHtml, true, { historyId: data.history_id });
                if (data.conversation_id) {
                    this.currentConversationId = String(data.conversation_id);
                }
                
                this.currentHistory.push(
                    { type: 'question', content: question },
                    { type: 'answer', content: data.answer }
                );
                
                await this.loadHistory();
                this.clearPendingAttachments();
                
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
            
            if (questionMessage && questionMessage.parentNode) {
                questionMessage.parentNode.removeChild(questionMessage);
            } else {
                const messages = document.getElementById('messages');
                if (messages) {
                    const lastMessage = messages.lastElementChild;
                    if (lastMessage && lastMessage.classList.contains('question')) {
                        messages.removeChild(lastMessage);
                    }
                }
            }

            if (input && !input.value.trim()) {
                input.value = originalQuestion;
                input.focus();
            }
            
            this.showToast('发送失败: ' + error.message, 'error');
        }
    }

    renderImmediateMarkdown(text) {
        const source = (text || '').trim();
        if (!source) return '';

        const lines = source.split('\n');
        const blocks = [];
        let index = 0;

        const isSpecialStart = (line) => {
            const v = line || '';
            return (
                /^```/.test(v) ||
                /^\s*[-*]\s+/.test(v) ||
                /^\s*\d+\.\s+/.test(v) ||
                /^\s*#{1,6}\s+/.test(v) ||
                /^\s*>\s?/.test(v) ||
                /^\s*([-*_])\1{2,}\s*$/.test(v)
            );
        };

        while (index < lines.length) {
            const line = lines[index] || '';

            if (/^```/.test(line)) {
                const lang = (line.slice(3).trim() || '').replace(/[^\w-]/g, '');
                const codeLines = [];
                index += 1;
                while (index < lines.length && !/^```/.test(lines[index])) {
                    codeLines.push(lines[index]);
                    index += 1;
                }
                if (index < lines.length && /^```/.test(lines[index])) {
                    index += 1;
                }
                const codeClass = lang ? ` class="language-${lang}"` : '';
                blocks.push(`<pre><code${codeClass}>${this.escapeHtml(codeLines.join('\n'))}</code></pre>`);
                continue;
            }

            if (/^\s*[-*]\s+/.test(line)) {
                const items = [];
                while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
                    items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
                    index += 1;
                }
                blocks.push(`<ul>${items.map(item => `<li>${this.formatInlineMarkdown(item)}</li>`).join('')}</ul>`);
                continue;
            }

            if (/^\s*\d+\.\s+/.test(line)) {
                const items = [];
                while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
                    items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
                    index += 1;
                }
                blocks.push(`<ol>${items.map(item => `<li>${this.formatInlineMarkdown(item)}</li>`).join('')}</ol>`);
                continue;
            }

            const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                blocks.push(`<h${level}>${this.formatInlineMarkdown(headingMatch[2])}</h${level}>`);
                index += 1;
                continue;
            }

            if (/^\s*>\s?/.test(line)) {
                const quoteLines = [];
                while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                    quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
                    index += 1;
                }
                blocks.push(`<blockquote>${quoteLines.map(item => this.formatInlineMarkdown(item)).join('<br>')}</blockquote>`);
                continue;
            }

            if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
                blocks.push('<hr>');
                index += 1;
                continue;
            }

            if (!line.trim()) {
                index += 1;
                continue;
            }

            const paragraph = [line];
            index += 1;
            while (index < lines.length && lines[index].trim() && !isSpecialStart(lines[index])) {
                paragraph.push(lines[index]);
                index += 1;
            }
            blocks.push(`<p>${paragraph.map(item => this.formatInlineMarkdown(item)).join('<br>')}</p>`);
        }

        return blocks.join('');
    }

    formatInlineMarkdown(text) {
        let html = this.escapeHtml(text || '');
        html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        return html;
    }

    normalizeAnswerHtml(answerHtml, rawAnswer) {
        const raw = String(rawAnswer || '');
        const html = String(answerHtml || '');
        if (!html) {
            return this.escapeHtml(raw).replace(/\n/g, '<br>');
        }

        try {
            const probe = document.createElement('div');
            probe.innerHTML = html;
            const renderedText = (probe.textContent || '').trim();
            const rawText = raw.trim();
            if (!rawText) {
                return html;
            }

            // 若渲染后的纯文本明显短于原始答案，回退为纯文本展示，避免“显示不完整”。
            if (!renderedText || renderedText.length < Math.floor(rawText.length * 0.55)) {
                return this.escapeHtml(raw).replace(/\n/g, '<br>');
            }
            return html;
        } catch (e) {
            console.error('答案HTML完整性检查失败，回退纯文本:', e);
            return this.escapeHtml(raw).replace(/\n/g, '<br>');
        }
    }

    displayMessage(type, content, isHtml = false, options = {}) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return null;
        
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
        
        let actionsHtml = '';
        if (type === 'answer' && options && options.historyId) {
            const historyId = this.escapeHtml(String(options.historyId));
            actionsHtml = `
                <span class="message-actions">
                    <a href="#" onclick="app.downloadMessage('${historyId}','md',event)">下载MD</a>
                    <a href="#" onclick="app.downloadMessage('${historyId}','txt',event)">TXT</a>
                    <a href="#" onclick="app.downloadMessage('${historyId}','json',event)">JSON</a>
                </span>
            `;
        }

        message.innerHTML = `
            <div class="message-header">
                <i class="fas ${icon}"></i>
                <strong>${header}</strong>
            </div>
            <div class="message-content markdown-body">${formattedContent}</div>
            <div class="message-footer">
                <i class="fas fa-clock"></i> ${timeStr}
                ${actionsHtml}
            </div>
        `;
        
        this.addCopyButtons(message);
        messagesContainer.appendChild(message);
        
        const autoScroll = document.getElementById('autoScroll');
        if (autoScroll && autoScroll.checked) {
            this.scrollToBottom();
        }

        return message;
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
            (item.title && item.title.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
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
            const title = item.title || item.conversation_title || item.question || '未命名对话';
            const displayTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
            
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
                    <h4 title="${this.escapeHtml(title)}">${this.escapeHtml(displayTitle)}</h4>
                    <div class="history-meta">
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        <div class="history-actions">
                            <button class="rename-history" onclick="app.renameConversationItem('${encodedConversationId}', event)">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="delete-history" onclick="app.deleteHistoryItem('${encodedConversationId}', event)">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
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

    startNewConversation() {
        this.clearChat();
        this.showToast('已新建对话', 'info');
        const input = document.getElementById('questionInput');
        if (input) input.focus();
    }

    async renameConversationItem(conversationIdEncoded, event) {
        if (event) event.stopPropagation();
        const conversationId = decodeURIComponent(conversationIdEncoded || '').trim();
        if (!conversationId) return;

        const target = this.allHistory.find(item => String(item.conversation_id || '') === conversationId);
        const oldTitle = (target && (target.title || target.question)) ? (target.title || target.question) : '';
        const newTitle = prompt('请输入新的会话标题：', oldTitle);
        if (newTitle === null) return;
        const title = newTitle.trim();
        if (!title) {
            this.showToast('标题不能为空', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/conversations/' + encodeURIComponent(conversationId) + '/title', {
                method: 'PATCH',
                headers: this.withCsrfHeaders({
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }),
                body: JSON.stringify({ title })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || '更新标题失败');
            }

            if (target) {
                target.title = title;
            }
            this.renderHistoryList();
            this.showToast('标题已更新', 'success');
        } catch (error) {
            console.error('更新会话标题失败:', error);
            this.showToast('更新标题失败: ' + error.message, 'error');
        }
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
        this.clearPendingAttachments();
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
