import { callAgentTool, callExplorerTool, ensureSuccess, parseToolResult } from "/explorer/services/infrastructure/explorerApi.js";
import { withGlobalLoader } from "/explorer/utils/globalLoader.js";
import { getWorkspaceRoot } from "/explorer/utils/workspaceRoot.js";

export class BacklogPanel {
    constructor(element, invalidate, props = {}) {
        this.element = element;
        this.invalidate = invalidate;
        this.props = props || {};
        this.workspaceRoot = getWorkspaceRoot();
        this.repoPath = '';
        this.state = {
            config: null,
            tasks: [],
            conflict: false,
            viewMode: 'carousel',
            filters: {
                status: '',
                q: ''
            },
            error: ''
        };
        this.invalidate();
    }

    beforeRender() {}

    async afterRender() {
        this.cacheElements();
        this.bindFilterEvents();
        this.mountFiltersInHeader();
        await this.refreshAll();
    }

    afterUnload() {
    }

    cacheElements() {
        this.errorBox = this.element.querySelector('#backlogError');
        this.conflictBox = this.element.querySelector('#backlogConflict');
        this.header = this.element.querySelector('#backlogHeader');
        this.fileLabel = this.element.querySelector('#backlogFileLabel');
        this.filtersContainer = this.element.querySelector('#backlogFilters');
        this.statusFilter = this.element.querySelector('#backlogStatusFilter');
        this.searchFilter = this.element.querySelector('#backlogSearchFilter');
        this.list = this.element.querySelector('#backlogList');
        this.listView = this.element.querySelector('#backlogListView');
        this.listToggle = this.element.querySelector('#backlogListToggle');
        this.listHint = this.element.querySelector('#backlogListHint');
        this.empty = this.element.querySelector('#backlogEmpty');
        this.carouselInfo = this.element.querySelector('#backlogCarouselInfo');
        this.carousel = this.element.querySelector('#backlogCarousel');
        this.sectionTitle = this.element.querySelector('#backlogSectionTitle');
        this.exportButton = this.element.querySelector('#backlogExportHistory');
        this.state.currentIndex = this.state.currentIndex || 0;
        this.workspaceRoot = getWorkspaceRoot();
        this.rawRepoPath = String(this.element.getAttribute('data-repo-path') || '').trim();
        this.rawBacklogPath = String(this.element.getAttribute('data-path') || '').trim();
        const isBacklogPath = this.rawBacklogPath.endsWith('.backlog') || this.rawBacklogPath.endsWith('.history');
        this.backlogPath = this.rawBacklogPath && isBacklogPath ? this.toFilesystemPath(this.rawBacklogPath) : '';
        this.isHistory = Boolean(this.rawBacklogPath && this.rawBacklogPath.endsWith('.history'));
        this.repoPath = this.toFilesystemPath(this.rawRepoPath);
        if (!this.repoPath && this.backlogPath) {
            this.repoPath = this.parentPath(this.backlogPath);
        }
        if (!this.repoPath || !this.repoPath.startsWith('/')) {
            this.setError('Backlog error: repoPath must be an absolute path.');
            this.repoPath = '';
        }
        if (this.backlogPath && !this.backlogPath.startsWith('/')) {
            this.setError('Backlog error: backlogPath must be an absolute path.');
            this.backlogPath = '';
        }
        this.updateBacklogFileLabel();
        this.updateModeUI();
    }

    mountFiltersInHeader() {
        if (!this.filtersContainer || !this.header) return;
        const headerExtras = document.querySelector('#previewHeaderExtras');
        if (!headerExtras) return;
        const existingHeader = headerExtras.querySelector('#backlogHeader');
        if (existingHeader && existingHeader !== this.header) {
            existingHeader.remove();
        }
        const existingFilters = headerExtras.querySelector('.backlog-filters');
        if (existingFilters && existingFilters !== this.filtersContainer) {
            existingFilters.remove();
        }
        const actions = this.header.querySelector('.backlog-actions');
        const existingActions = headerExtras.querySelector('.backlog-actions');
        if (existingActions && existingActions !== actions) {
            existingActions.remove();
        }
        if (!headerExtras.contains(this.header)) {
            const togglebtn = headerExtras.querySelector('#backlogViewToggle');
            headerExtras.insertBefore(this.header, togglebtn);
        }
        if (actions && !headerExtras.contains(actions)) {
            headerExtras.appendChild(actions);
        }
        if (!headerExtras.contains(this.filtersContainer)) {
            headerExtras.appendChild(this.filtersContainer);
        }
        this.header.webSkelPresenter = this;
        this.filtersContainer.webSkelPresenter = this;
    }

    updateBacklogFileLabel() {
        if (!this.fileLabel) return;
        const fallback = 'No backlog selected';
        if (!this.backlogPath) {
            this.fileLabel.textContent = fallback;
            return;
        }
        const fileName = String(this.backlogPath).split('/').pop() || fallback;
        this.fileLabel.textContent = fileName.replace(/\.backlog$|\.history$/i, '');
    }

    updateModeUI() {
        if (this.sectionTitle) {
            this.sectionTitle.textContent = this.isHistory ? 'History' : 'Tasks';
        }
        if (this.conflictBox) {
            this.conflictBox.textContent = this.isHistory
                ? '.history has merge conflicts. Resolve them before viewing.'
                : '.backlog has merge conflicts. Resolve them before editing tasks.';
        }
        const createButton = this.element.querySelector('[data-local-action="openCreateTaskModal"]');
        if (createButton) {
            createButton.style.display = this.isHistory ? 'none' : '';
        }
        if (this.exportButton) {
            this.exportButton.style.display = this.isHistory ? '' : 'none';
        }
        if (this.statusFilter) {
            const statusLabel = this.statusFilter.closest('label');
            if (statusLabel) statusLabel.classList.toggle('is-hidden', this.isHistory);
        }
    }

    bindFilterEvents() {
        this.bindFilterInput(this.statusFilter);
        this.bindFilterInput(this.searchFilter);
    }

    bindFilterInput(element) {
        if (!element || element.dataset.boundBacklogFilter) return;
        const handler = () => this.applyFilters();
        element.addEventListener('input', handler);
        element.addEventListener('change', handler);
        element.dataset.boundBacklogFilter = 'true';
    }

    applyFilters() {
        if (!this.isHistory) {
            this.state.filters.status = this.statusFilter?.value ?? '';
        } else {
            this.state.filters.status = '';
        }
        this.state.filters.q = this.searchFilter?.value ?? '';
        this.loadTasks();
    }

    clearFilters() {
        this.state.filters = { status: '', q: '' };
        if (this.statusFilter) this.statusFilter.value = '';
        if (this.searchFilter) this.searchFilter.value = '';
        this.loadTasks();
    }

    async refreshAll() {
        await withGlobalLoader(async () => {
            await this.ensureFilesystemPaths();
            await this.loadConfig();
            await this.checkBacklogConflict();
            if (!this.state.conflict) {
                await this.loadTasks();
            } else {
                this.state.tasks = [];
                this.renderTasks();
            }
        });
    }

    async loadConfig() {
        if (!this.repoPath) return;
        try {
            const payload = await this.callTasksTool('task_config', { repoPath: this.repoPath });
            this.state.config = payload?.config || null;
            this.clearError();
            this.renderSelectOptions();
        } catch (error) {
            this.setError(`Backlog config error: ${error?.message || error}`);
        }
    }

    async loadTasks() {
        if (!this.repoPath) return;
        if (!this.backlogPath) {
            this.setError('Select a .backlog or .history file to load tasks.');
            this.state.tasks = [];
            this.renderTasks();
            return;
        }
        try {
            if (this.state.conflict) {
                this.state.tasks = [];
                this.renderTasks();
                return;
            }
            const args = {};
            const filters = this.state.filters;
            if (filters.status) args.status = filters.status;
            if (filters.q) args.q = filters.q;
            if (this.backlogPath) {
                args.backlogPath = this.backlogPath;
            }
            const toolName = this.isHistory ? 'task_history_list' : 'task_list';
            const payload = await this.callTasksTool(toolName, { ...args, repoPath: this.repoPath });
            this.state.tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
            this.clearError();
            this.renderTasks();
        } catch (error) {
            this.setError(`Task list error: ${error?.message || error}`);
        }
    }

    async checkBacklogConflict() {
        let conflict = false;
        try {
            if (!this.repoPath) {
                this.state.conflict = false;
                this.updateConflictUI();
                return;
            }
            const payload = await this.callAgentToolRaw('gitAgent', 'git_status', { path: this.repoPath || this.workspaceRoot });
            const conflicted = Array.isArray(payload?.status?.conflicted) ? payload.status.conflicted : [];
            if (this.backlogPath) {
                const relative = this.relativeToRepo(this.backlogPath);
                conflict = conflicted.some((entry) => String(entry || '') === relative);
            } else {
                conflict = conflicted.some((entry) => String(entry || '').endsWith('.backlog') || String(entry || '').endsWith('.history'));
            }
        } catch {
            conflict = false;
        }
        this.state.conflict = conflict;
        this.updateConflictUI();
    }

    async callTasksTool(name, args) {
        const raw = await callAgentTool('tasksAgent', name, args || {}, { raw: true });
        ensureSuccess(raw);
        const parsed = parseToolResult(raw);
        return parsed || {};
    }

    async callAgentToolRaw(agentName, toolName, args) {
        const raw = await callAgentTool(agentName, toolName, args || {}, { raw: true });
        const parsed = parseToolResult(raw);
        return parsed || {};
    }

    renderSelectOptions() {
        const config = this.state.config || {};
        const statuses = Object.entries(config.statuses || {});
        if (this.statusFilter) {
            this.statusFilter.innerHTML = '';
            this.statusFilter.appendChild(new Option('All', ''));
            for (const [key, label] of statuses) {
                this.statusFilter.appendChild(new Option(label, key));
            }
            if (this.state.filters.status) {
                this.statusFilter.value = this.state.filters.status;
            }
        }

    }

    renderTasks() {
        if (!this.list) return;
        if (this.listToggle) {
            this.listToggle.classList.toggle('is-active', this.state.viewMode === 'list');
            this.listToggle.textContent = this.state.viewMode === 'list' ? 'Carousel view' : 'List view';
        }
        this.list.innerHTML = '';
        if (this.listView) this.listView.innerHTML = '';
        if (this.listHint) this.listHint.style.display = 'none';
        const tasks = Array.isArray(this.state.tasks) ? this.state.tasks : [];
        if (!tasks.length) {
            if (this.empty) this.empty.style.display = 'block';
            if (this.carouselInfo) this.carouselInfo.textContent = '0 / 0';
            if (this.carousel) this.carousel.style.display = 'none';
            if (this.listView) this.listView.classList.remove('is-visible');
            return;
        }
        if (this.empty) this.empty.style.display = 'none';
        if (this.state.viewMode === 'list') {
            if (this.list) this.list.style.display = 'none';
            if (this.carousel) this.carousel.style.display = 'none';
            if (this.listView) this.listView.classList.add('is-visible');
            if (this.listHint && !this.state.conflict && !this.isHistory) {
                this.listHint.style.display = 'block';
            }
            this.renderListView(tasks);
            if (this.carouselInfo) this.carouselInfo.textContent = `${this.state.currentIndex + 1} / ${tasks.length}`;
            return;
        }
        if (this.listView) this.listView.classList.remove('is-visible');
        if (this.list) this.list.style.display = '';
        if (this.carousel) this.carousel.style.display = '';
        if (this.state.currentIndex >= tasks.length) {
            this.state.currentIndex = Math.max(0, tasks.length - 1);
        }
        const statuses = this.state.config?.statuses || {};
        const task = tasks[this.state.currentIndex];
        if (!task) return;
        const row = document.createElement('backlog-task-row');
        row.setAttribute('data-presenter', 'backlog-task-row');
        row.setAttribute('data-task', encodeURIComponent(JSON.stringify(task)));
        row.setAttribute('data-statuses', encodeURIComponent(JSON.stringify(statuses)));
        row.setAttribute('data-readonly', this.isHistory ? 'true' : 'false');
        this.list.appendChild(row);
        if (this.carouselInfo) {
            this.carouselInfo.textContent = `${this.state.currentIndex + 1} / ${tasks.length}`;
        }
    }

    renderListView(tasks) {
        if (!this.listView) return;
        this.listView.innerHTML = '';
        const statuses = this.state.config?.statuses || {};
        for (const task of tasks) {
            const item = document.createElement('div');
            item.className = 'backlog-list-item';
            item.setAttribute('draggable', String(!this.state.conflict && !this.isHistory));
            item.dataset.id = task.id;
            const status = String(task.status || '').trim();
            const statusLabel = String(statuses[status] || status || 'Status');
            const desc = String(task.description || '').trim() || '(No description)';
            item.innerHTML = `
                <div class="backlog-list-order">${Number(task.order) || ''}</div>
                <div class="backlog-list-desc">${this.escapeHtml(desc)}</div>
                <div class="backlog-list-status ${status ? `status-${this.escapeHtml(status)}` : ''}">${this.escapeHtml(statusLabel)}</div>
            `;
            if (!this.state.conflict && !this.isHistory) {
                this.bindListDnD(item);
            }
            this.listView.appendChild(item);
        }
    }

    bindListDnD(item) {
        if (!item || item.dataset.boundDnD) return;
        item.addEventListener('dragstart', (event) => {
            this.dragState = { id: item.dataset.id };
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.dataset.id || '');
            item.classList.add('is-dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('is-dragging');
            this.clearDragOver();
            this.dragState = null;
        });
        item.addEventListener('dragover', (event) => {
            event.preventDefault();
            this.clearDragOver();
            item.classList.add('is-drag-over');
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('is-drag-over');
        });
        item.addEventListener('drop', async (event) => {
            event.preventDefault();
            item.classList.remove('is-drag-over');
            const fromId = this.dragState?.id;
            const toId = item.dataset.id;
            if (!fromId || !toId || fromId === toId) return;
            await this.reorderByDnD(fromId, toId);
        });
        item.dataset.boundDnD = 'true';
    }

    clearDragOver() {
        if (!this.listView) return;
        const items = this.listView.querySelectorAll('.backlog-list-item.is-drag-over');
        for (const node of items) {
            node.classList.remove('is-drag-over');
        }
    }

    async reorderByDnD(fromId, toId) {
        if (this.isHistory) return;
        if (!this.repoPath || !this.backlogPath) return;
        const tasks = Array.isArray(this.state.tasks) ? this.state.tasks : [];
        const fromIndex = tasks.findIndex((task) => task.id === fromId);
        const toIndex = tasks.findIndex((task) => task.id === toId);
        if (fromIndex < 0 || toIndex < 0) return;
        const next = [...tasks];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        const order = next.map((task) => task.id);
        await withGlobalLoader(async () => {
            const result = await this.callTasksTool('task_reorder', {
                order,
                backlogPath: this.backlogPath,
                repoPath: this.repoPath
            });
            if (Array.isArray(result?.tasks)) {
                this.state.tasks = result.tasks;
            }
            this.renderTasks();
        });
    }

    async reorderRelative(payload) {
        if (this.isHistory) return;
        if (!payload?.id || !payload?.delta) return;
        if (!this.repoPath || !this.backlogPath) return;
        const tasks = Array.isArray(this.state.tasks) ? this.state.tasks : [];
        const fromIndex = tasks.findIndex((task) => task.id === payload.id);
        if (fromIndex < 0) return;
        const toIndex = Math.max(0, Math.min(tasks.length - 1, fromIndex + payload.delta));
        if (toIndex === fromIndex) return;
        const next = [...tasks];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        const order = next.map((task) => task.id);
        await withGlobalLoader(async () => {
            const result = await this.callTasksTool('task_reorder', {
                order,
                backlogPath: this.backlogPath,
                repoPath: this.repoPath
            });
            if (Array.isArray(result?.tasks)) {
                this.state.tasks = result.tasks;
                const updatedIndex = this.state.tasks.findIndex((task) => task.id === payload.id);
                if (updatedIndex >= 0) {
                    this.state.currentIndex = updatedIndex;
                }
            }
            this.renderTasks();
        });
    }

    toggleListView() {
        this.state.viewMode = this.state.viewMode === 'list' ? 'carousel' : 'list';
        if (this.listToggle) {
            this.listToggle.classList.toggle('is-active', this.state.viewMode === 'list');
            this.listToggle.textContent = this.state.viewMode === 'list' ? 'Carousel view' : 'List view';
        }
        this.renderTasks();
    }


    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    prevTask() {
        if (!Array.isArray(this.state.tasks) || !this.state.tasks.length) return;
        this.state.currentIndex = Math.max(0, this.state.currentIndex - 1);
        this.renderTasks();
    }

    nextTask() {
        if (!Array.isArray(this.state.tasks) || !this.state.tasks.length) return;
        this.state.currentIndex = Math.min(this.state.tasks.length - 1, this.state.currentIndex + 1);
        this.renderTasks();
    }

    async createBacklogTask(payload = {}) {
        if (this.isHistory) return;
        if (this.state.conflict) {
            this.setError('Resolve .backlog conflicts before editing.');
            return;
        }
        if (!this.repoPath) return;
        if (!this.backlogPath) {
            this.setError('Select a .backlog file before creating tasks.');
            return;
        }
        const description = String(payload.description || '').trim();
        if (!description) {
            this.setError('Description is required.');
            return;
        }
        const request = {
            description,
            repoPath: this.repoPath
        };
        if (this.backlogPath) {
            request.backlogPath = this.backlogPath;
        }
        await withGlobalLoader(async () => {
            try {
                const result = await this.callTasksTool('task_create', request);
                await this.loadTasks();
                const createdId = String(result?.task?.id || '').trim();
                if (createdId && Array.isArray(this.state.tasks)) {
                    const nextIndex = this.state.tasks.findIndex((task) => String(task?.id || '').trim() === createdId);
                    if (nextIndex >= 0) {
                        this.state.currentIndex = nextIndex;
                        this.renderTasks();
                    }
                } else if (Array.isArray(this.state.tasks) && this.state.tasks.length > 0) {
                    this.state.currentIndex = this.state.tasks.length - 1;
                    this.renderTasks();
                }
                this.clearError();
            } catch (error) {
                this.setError(`Task create error: ${error?.message || error}`);
            }
        });
    }

    async saveTask(payload) {
        if (this.isHistory) return;
        if (!payload?.id) return;
        if (this.state.conflict) {
            this.setError('Resolve .backlog conflicts before editing.');
            return;
        }
        if (!this.repoPath) return;
        if (!this.backlogPath && !payload?.sourcePath) {
            this.setError('Select a .backlog file before editing tasks.');
            return;
        }
        const request = {
            ...payload,
            ifMatch: payload.taskHash || '',
            backlogPath: payload.sourcePath || this.backlogPath || '',
            repoPath: this.repoPath
        };
        const silent = Boolean(payload?.silent);
        const runUpdate = async () => {
            try {
                const result = await this.callTasksTool('task_update', request);
                if (result?.task && Array.isArray(this.state.tasks)) {
                    const index = this.state.tasks.findIndex((task) => task?.id === result.task.id);
                    if (index >= 0) {
                        this.state.tasks[index] = result.task;
                    }
                }
            } catch (error) {
                if (error?.data?.conflict) {
                    await this.handleTaskConflict(error.data.conflict, payload);
                    return;
                }
                throw error;
            }
        };
        if (silent) {
            try {
                await runUpdate();
            } catch (error) {
                this.setError(`Task update error: ${error?.message || error}`);
            }
            return;
        }
        await withGlobalLoader(async () => {
            await runUpdate();
            await this.loadTasks();
        });
    }

    async updateTaskStatus(payload) {
        if (this.isHistory) return;
        const id = payload?.id;
        const status = payload?.status;
        if (!id || !status) return;
        if (this.state.conflict) {
            this.setError('Resolve .backlog conflicts before editing.');
            return;
        }
        if (!this.repoPath) return;
        if (!this.backlogPath && !payload?.sourcePath) {
            this.setError('Select a .backlog file before editing tasks.');
            return;
        }
        await withGlobalLoader(async () => {
            try {
                await this.callTasksTool('task_update', {
                    id,
                    status,
                    description: payload.description,
                    resolution: payload.resolution,
                    ifMatch: payload.taskHash || '',
                    backlogPath: payload.sourcePath || this.backlogPath || '',
                    repoPath: this.repoPath
                });
            } catch (error) {
                if (error?.data?.conflict) {
                    await this.handleTaskConflict(error.data.conflict, payload);
                    return;
                }
                throw error;
            }
            await this.loadTasks();
        });
    }

    async deleteTask(payload) {
        if (this.isHistory) return;
        const id = payload?.id;
        if (!id) return;
        if (this.state.conflict) {
            this.setError('Resolve .backlog conflicts before editing.');
            return;
        }
        if (!this.repoPath) return;
        if (!this.backlogPath && !payload?.sourcePath) {
            this.setError('Select a .backlog file before editing tasks.');
            return;
        }
        const ok = window.confirm('Delete this task?');
        if (!ok) return;
        await withGlobalLoader(async () => {
            try {
                await this.callTasksTool('task_delete', {
                    id,
                    repoPath: this.repoPath,
                    backlogPath: payload.sourcePath || this.backlogPath || ''
                });
            } catch (error) {
                const message = String(error?.message || error);
                if (!message.includes('Task not found')) {
                    throw error;
                }
            } finally {
                await this.loadTasks();
            }
        });
    }

    async refreshBacklog(button) {
        if (button) button.disabled = true;
        await this.refreshAll();
        if (button) button.disabled = false;
    }

    async openCreateTaskModal() {
        if (this.state.conflict) {
            this.setError('Resolve .backlog conflicts before editing.');
            return;
        }
        const payload = await assistOS.UI.createReactiveModal('backlog-create-modal', {
        }, true);
        if (payload && typeof payload.description === 'string' && payload.description.trim()) {
            await this.createBacklogTask(payload);
        }
    }

    setError(message) {
        this.state.error = String(message || 'Unknown error');
        if (this.errorBox) {
            this.errorBox.textContent = this.state.error;
            this.errorBox.classList.add('is-visible');
        }
    }

    clearError() {
        this.state.error = '';
        if (this.errorBox) {
            this.errorBox.textContent = '';
            this.errorBox.classList.remove('is-visible');
        }
    }

    updateConflictUI() {
        if (this.conflictBox) {
            this.conflictBox.classList.toggle('is-visible', this.state.conflict);
        }
        const disabled = Boolean(this.state.conflict);
        const inputs = this.element.querySelectorAll('input, select, textarea, button');
        for (const input of inputs) {
            if (input.closest('.backlog-actions')) continue;
            if (input.closest('.backlog-create-actions')) continue;
            if (input.closest('.backlog-carousel')) continue;
            input.disabled = disabled || this.isHistory;
        }
        const createButton = this.element.querySelector('.backlog-create-actions button');
        if (createButton) createButton.disabled = disabled || this.isHistory;
    }

    async exportHistory() {
        if (!this.isHistory || !this.backlogPath) return;
        try {
            const raw = await callExplorerTool('read_text_file', { path: this.backlogPath }, { raw: true });
            const parsed = parseToolResult(raw) || {};
            const text = typeof parsed.text === 'string' ? parsed.text : '';
            const fileName = (String(this.backlogPath).split('/').pop() || 'history').replace(/\.history$/i, '') + '.history.json';
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (error) {
            this.setError(`Export failed: ${error?.message || error}`);
        }
    }

    parentPath(value) {
        const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/g, '');
        if (!normalized || normalized === '/') return '/';
        const parts = normalized.split('/');
        parts.pop();
        const next = parts.join('/') || '/';
        return next;
    }

    relativeToRepo(absolutePath) {
        if (!absolutePath || !this.repoPath) return '';
        return String(absolutePath).replace(String(this.repoPath).replace(/\/+$/g, ''), '').replace(/^\/+/, '');
    }

    async ensureFilesystemPaths() {
        const needsWorkspaceRoot = !this.workspaceRoot || this.workspaceRoot === '/' || this.workspaceRoot === '.';
        if (needsWorkspaceRoot) {
            try {
                const text = await callExplorerTool('list_allowed_directories', {}, { raw: false, withLoader: false });
                const lines = String(text || '')
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .filter((line) => !/^Allowed directories:\s*$/i.test(line));
                const workspaceRoot = String(lines[0] || '').trim().replace(/\/+$/g, '');
                if (workspaceRoot && workspaceRoot.startsWith('/')) {
                    this.workspaceRoot = workspaceRoot;
                }
            } catch {
                // leave fallback workspace root as-is
            }
        }

        const isBacklogPath = String(this.rawBacklogPath || '').endsWith('.backlog') || String(this.rawBacklogPath || '').endsWith('.history');
        this.backlogPath = this.rawBacklogPath && isBacklogPath ? this.toFilesystemPath(this.rawBacklogPath) : '';
        this.repoPath = this.toFilesystemPath(this.rawRepoPath);
        if (!this.repoPath && this.backlogPath) {
            this.repoPath = this.parentPath(this.backlogPath);
        }
    }

    toFilesystemPath(input) {
        const raw = String(input || '').trim();
        if (!raw) return '';
        const normalized = raw.replace(/\\/g, '/');
        const workspaceRoot = String(this.workspaceRoot || '').replace(/\\/g, '/').replace(/\/+$/g, '');
        if (!workspaceRoot) return normalized;
        if (normalized === workspaceRoot || normalized.startsWith(`${workspaceRoot}/`)) {
            return normalized;
        }
        if (normalized.startsWith('/')) {
            return `${workspaceRoot}${normalized}`;
        }
        return `${workspaceRoot}/${normalized.replace(/^\/+/, '')}`;
    }

    async handleTaskConflict(conflict, incoming) {
        if (!conflict?.current) {
            this.setError('This task was updated by someone else.');
            return;
        }
        const incomingMerged = { ...conflict.current, ...incoming };
        const payload = await assistOS.UI.createReactiveModal('backlog-conflict-modal', {
            current: encodeURIComponent(JSON.stringify(conflict.current)),
            incoming: encodeURIComponent(JSON.stringify(incomingMerged || {}))
        }, true);
        if (payload?.resolution === 'keep') {
            await this.callTasksTool('task_update', {
                ...incomingMerged,
                force: true,
                backlogPath: incomingMerged.sourcePath || conflict.current.sourcePath || '',
                repoPath: this.repoPath
            });
            await this.loadTasks();
        } else {
            await this.loadTasks();
        }
    }
}
