export class BacklogTaskRow {
    constructor(element, invalidate, props = {}) {
        this.element = element;
        this.invalidate = invalidate;
        this.props = props || {};
        this.state = {
            task: null,
            statuses: {},
            repos: [],
            readOnly: false
        };
        this.saveTimer = null;
        this.invalidate();
    }

    beforeRender() {}

    afterRender() {
        this.cacheElements();
        this.loadFromAttributes();
        this.bindEvents();
        this.applyState();
    }

    cacheElements() {
        this.root = this.element.querySelector('.backlog-task-row');
        this.descInput = this.element.querySelector('[data-field="description"]');
        this.resolutionInput = this.element.querySelector('[data-field="resolution"]');
        this.optionsList = this.element.querySelector('[data-field="optionsList"]');
        this.orderControls = this.element.querySelector('[data-field="orderControls"]');
        this.statusWrap = this.element.querySelector('.backlog-task-status-wrap');
        this.statusIcon = this.element.querySelector('[data-field="statusIcon"]');
        this.statusLabel = this.element.querySelector('[data-field="statusLabel"]');
        this.quickActions = this.element.querySelector('[data-field="quickActions"]');
        this.approveButton = this.element.querySelector('[data-local-action="approveTask"]');
        this.deleteButton = this.element.querySelector('[data-local-action="deleteTask"]');
    }

    loadFromAttributes() {
        const taskPayload = this.element.getAttribute('data-task');
        const statusesPayload = this.element.getAttribute('data-statuses');
        const readOnlyPayload = String(this.element.getAttribute('data-readonly') || '').trim();
        this.state.task = this.parsePayload(taskPayload) || {};
        this.state.statuses = this.parsePayload(statusesPayload) || {};
        this.state.repos = [];
        this.state.readOnly = readOnlyPayload === 'true';
    }

    parsePayload(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(decodeURIComponent(raw));
        } catch {
            return null;
        }
    }

    bindEvents() {
        if (this.state.readOnly) return;
        const markDirty = () => {
            this.resizeDescription();
            this.resizeResolution();
            this.syncOptionSelectionFromResolution();
            this.updateApproveState();
        };
        const scheduleSave = () => {
            this.queueSave();
        };
        for (const input of [this.descInput, this.resolutionInput]) {
            if (!input) continue;
            input.addEventListener('input', () => {
                markDirty();
                scheduleSave();
            });
            input.addEventListener('change', () => {
                markDirty();
                scheduleSave();
            });
        }
    }

    applyState() {
        const task = this.state.task || {};
        if (this.descInput) this.descInput.value = task.description || '';
        if (this.resolutionInput) this.resolutionInput.value = task.resolution || '';

        this.syncStatusIcon();
        this.updateQuickActions();
        this.updateFieldAccess();
        this.syncStatusIcon();
        this.renderOptions();

        this.resizeDescription();
        this.resizeResolution();
        this.updateApproveState();
        this.ensureAutoSelection();
    }

    syncStatusIcon() {
        if (!this.statusIcon) return;
        const status = String(this.state.task?.status || '').trim();
        const label = this.state.statuses?.[status] || status || '';
        if (this.statusWrap) {
            this.statusWrap.className = 'backlog-task-status-wrap';
            if (status) {
                this.statusWrap.classList.add(`status-${status}`);
            }
        }
        this.statusIcon.className = 'backlog-task-status';
        if (status) {
            this.statusIcon.classList.add(`status-${status}`);
        }
        this.statusIcon.title = label || 'Status';
        this.statusIcon.setAttribute('aria-label', label || 'Status');
        if (this.statusLabel) {
            this.statusLabel.textContent = label || 'Status';
        }
    }

    updateFieldAccess() {
        const status = String(this.state.task?.status || '').trim();
        const editableStatuses = new Set(['new']);
        const isReadOnly = Boolean(this.state.readOnly);
        const canEditAll = !isReadOnly && editableStatuses.has(status);
        if (this.descInput) this.descInput.disabled = !canEditAll;
        if (this.resolutionInput) this.resolutionInput.disabled = !canEditAll;
        if (this.optionsList) {
            this.optionsList.classList.toggle('is-disabled', !canEditAll);
            for (const button of Array.from(this.optionsList.querySelectorAll('button'))) {
                button.disabled = !canEditAll;
            }
        }
        if (this.approveButton) this.approveButton.disabled = !canEditAll || !this.hasResolution();
        if (this.deleteButton) {
            this.deleteButton.disabled = !canEditAll;
            this.deleteButton.style.display = isReadOnly ? 'none' : '';
        }
        if (this.orderControls) {
            const buttons = Array.from(this.orderControls.querySelectorAll('button'));
            for (const button of buttons) {
                button.disabled = isReadOnly;
            }
        }
    }

    updateQuickActions() {
        if (!this.quickActions) return;
        if (this.state.readOnly) {
            this.quickActions.style.display = 'none';
            return;
        }
        this.quickActions.style.display = '';
        const status = String(this.state.task?.status || '').trim();
        const visibility = {
            approveTask: status === 'new',
            markDone: false
        };
        for (const button of Array.from(this.quickActions.querySelectorAll('button[data-local-action]'))) {
            const action = button.getAttribute('data-local-action');
            const show = Boolean(visibility[action]);
            button.style.display = show ? '' : 'none';
        }
    }

    resizeDescription() {
        if (!this.descInput) return;
        this.descInput.style.height = 'auto';
        this.descInput.style.height = `${this.descInput.scrollHeight}px`;
    }

    resizeResolution() {
        if (!this.resolutionInput) return;
        this.resolutionInput.style.height = 'auto';
        this.resolutionInput.style.height = `${this.resolutionInput.scrollHeight}px`;
    }

    getOptions() {
        const options = Array.isArray(this.state.task?.options) ? this.state.task.options : [];
        return options.map((opt) => (typeof opt === 'string' ? opt : String(opt || ''))).filter(Boolean);
    }

    parseResolutionLines(value) {
        return String(value || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line);
    }

    setResolutionLines(lines) {
        if (!this.resolutionInput) return;
        this.resolutionInput.value = lines.join('\n');
        this.resizeResolution();
        this.syncOptionSelectionFromResolution();
        this.updateApproveState();
        this.queueSave();
    }

    getResolutionValue() {
        if (this.resolutionInput && typeof this.resolutionInput.value === 'string') {
            return this.resolutionInput.value;
        }
        return String(this.state.task?.resolution || '');
    }

    hasResolution() {
        return this.parseResolutionLines(this.getResolutionValue()).length > 0;
    }

    updateApproveState() {
        if (!this.approveButton) return;
        const status = String(this.state.task?.status || '').trim();
        const canEdit = status === 'new';
        this.approveButton.disabled = !canEdit || !this.hasResolution();
    }

    ensureAutoSelection() {
        const options = this.getOptions();
        if (!options.length || options.length !== 1) return;
        const status = String(this.state.task?.status || '').trim();
        if (status !== 'new') return;
        if (!this.resolutionInput) return;
        if (this.hasResolution()) return;
        this.resolutionInput.value = options[0];
        this.resizeResolution();
        this.syncOptionSelectionFromResolution();
        this.updateApproveState();
    }

    renderOptions() {
        if (!this.optionsList) return;
        const options = this.getOptions();
        if (!options.length) {
            this.optionsList.innerHTML = '';
            this.optionsList.style.display = 'none';
            return;
        }
        this.optionsList.style.display = '';
        this.optionsList.innerHTML = '';
        options.forEach((option, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'backlog-option';
            button.dataset.value = option;
            button.innerHTML = `<span class="backlog-option-index">${index + 1}.</span><span class="backlog-option-text"></span>`;
            const textEl = button.querySelector('.backlog-option-text');
            if (textEl) textEl.textContent = option;
            button.addEventListener('click', () => this.toggleOption(option));
            this.optionsList.appendChild(button);
        });
        this.syncOptionSelectionFromResolution();
    }

    syncOptionSelectionFromResolution() {
        if (!this.optionsList) return;
        const selected = new Set(this.parseResolutionLines(this.resolutionInput?.value || ''));
        for (const button of Array.from(this.optionsList.querySelectorAll('button'))) {
            const value = button.dataset.value || '';
            button.classList.toggle('is-selected', selected.has(value));
        }
    }

    toggleOption(option) {
        if (!this.resolutionInput || !option) return;
        const lines = this.parseResolutionLines(this.resolutionInput.value);
        const set = new Set(lines);
        if (set.has(option)) {
            set.delete(option);
        } else {
            set.add(option);
        }
        const ordered = this.getOptions().filter((opt) => set.has(opt));
        const extras = [...set].filter((opt) => !ordered.includes(opt));
        this.setResolutionLines([...ordered, ...extras]);
    }

    queueSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.saveTask();
        }, 300);
    }

    saveTask() {
        const task = this.state.task || {};
        const payload = {
            id: task.id,
            description: this.descInput?.value || '',
            resolution: this.resolutionInput?.value || '',
            taskHash: task.taskHash,
            sourcePath: task.sourcePath,
            silent: true
        };
        this.getParentPresenter()?.saveTask?.(payload);
    }

    approveTask() {
        if (!this.hasResolution()) return;
        this.dispatchStatus('approved');
    }

    markDone() {
        this.dispatchStatus('done');
    }

    dispatchStatus(status) {
        const task = this.state.task || {};
        const payload = {
            id: task.id,
            status,
            description: this.descInput?.value || '',
            resolution: this.resolutionInput?.value || '',
            taskHash: task.taskHash,
            sourcePath: task.sourcePath
        };
        this.getParentPresenter()?.updateTaskStatus?.(payload);
    }

    deleteTask() {
        const task = this.state.task || {};
        this.getParentPresenter()?.deleteTask?.({ id: task.id, sourcePath: task.sourcePath });
    }

    moveUp() {
        this.moveRelative(-1);
    }

    moveDown() {
        this.moveRelative(1);
    }

    moveRelative(direction) {
        if (!direction) return;
        const task = this.state.task || {};
        this.getParentPresenter()?.reorderRelative?.({ id: task.id, delta: direction, sourcePath: task.sourcePath });
    }

    getParentPresenter() {
        return this.element.closest('backlog-panel')?.webSkelPresenter || null;
    }
}
