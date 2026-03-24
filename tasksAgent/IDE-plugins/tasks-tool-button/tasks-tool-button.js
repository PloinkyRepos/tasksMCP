export class TasksToolButton {
    constructor(element, invalidate) {
        this.element = element;
        this.invalidate = invalidate;
        this.hostContext = {};
        this.boundDocumentClick = this.handleDocumentClick.bind(this);
        this.invalidate();
    }

    beforeRender() {}

    afterRender() {
        this.button = this.element.querySelector('#tasksToolButton');
        this.menu = this.element.querySelector('#tasksToolMenu');
        this.newBacklogButton = this.element.querySelector('#tasksToolNewBacklog');
        this.showAllButton = this.element.querySelector('#tasksToolShowAll');
        this.iconImageEl = this.element.querySelector('.tasks-tool-button-icon-image');
        this.labelEl = this.element.querySelector('.tasks-tool-button-label');

        this.boundToggleMenu = this.toggleMenu.bind(this);
        this.boundNewBacklog = this.handleNewBacklog.bind(this);
        this.boundShowAll = this.handleShowAll.bind(this);

        this.button?.addEventListener('click', this.boundToggleMenu);
        this.newBacklogButton?.addEventListener('click', this.boundNewBacklog);
        this.showAllButton?.addEventListener('click', this.boundShowAll);
        document.addEventListener('click', this.boundDocumentClick, true);

        this.syncButtonMetadata();
        this.setMenuOpen(false);
    }

    afterUnload() {
        this.button?.removeEventListener('click', this.boundToggleMenu);
        this.newBacklogButton?.removeEventListener('click', this.boundNewBacklog);
        this.showAllButton?.removeEventListener('click', this.boundShowAll);
        document.removeEventListener('click', this.boundDocumentClick, true);
    }

    updateHostContext(context = {}) {
        this.hostContext = context;
        this.syncButtonMetadata();
    }

    getHostPresenter() {
        return this.element.closest('main')?.querySelector('file-exp')?.webSkelPresenter
            || document.querySelector('file-exp')?.webSkelPresenter
            || null;
    }

    normalizePath(value) {
        return String(value || '').replace(/\\/g, '/').replace(/\/+$/g, '');
    }

    resolveCurrentFolder(host) {
        return this.normalizePath(host?.state?.path || '/') || '/';
    }

    async withHostLoader(host, fn) {
        if (!host || typeof fn !== 'function') return null;
        if (typeof host.withLoader === 'function') {
            return host.withLoader(fn);
        }
        return fn();
    }

    async listBacklogFilesInFolder(host, folderPath) {
        const entries = await host?.loadDirectoryContent?.(folderPath);
        if (!Array.isArray(entries)) {
            return [];
        }
        return entries
            .filter((entry) => entry?.type === 'file')
            .map((entry) => host.normalizePath(entry.path || host.joinPath(folderPath, entry.name || '')))
            .filter((fullPath) => fullPath.endsWith('.backlog') || fullPath.endsWith('.history'));
    }

    async applyBacklogFilterResult(host, folderPath, backlogFiles, preferredPath = '') {
        const entries = backlogFiles.map((fullPath) => ({
            name: fullPath.split('/').pop() || fullPath,
            path: fullPath,
            type: 'file',
            size: null,
            modified: null
        }));

        host.state.path = folderPath;
        host.state.entries = host.sortEntries(entries);
        host.state.allEntries = host.state.entries;
        host.renderEntries();
        host.setPreviewState({ backlogTextView: false }, { invalidate: false });

        const normalizedPreferred = preferredPath ? host.normalizePath(preferredPath) : '';
        const selectedPath = normalizedPreferred && backlogFiles.includes(normalizedPreferred)
            ? normalizedPreferred
            : (backlogFiles.length === 1 ? backlogFiles[0] : '');

        host.state.selectedPath = selectedPath;
        if (selectedPath) {
            await host.openFile(selectedPath);
            history.pushState(null, '', `#file-exp${selectedPath}`);
        }
    }

    syncButtonMetadata() {
        const label = typeof this.hostContext?.pluginLabel === 'string' && this.hostContext.pluginLabel.trim()
            ? this.hostContext.pluginLabel.trim()
            : this.element.getAttribute('data-plugin-label') || 'Tasks';
        const tooltip = typeof this.hostContext?.pluginTooltip === 'string' && this.hostContext.pluginTooltip.trim()
            ? this.hostContext.pluginTooltip.trim()
            : this.element.getAttribute('data-plugin-tooltip') || label;
        const icon = typeof this.hostContext?.pluginIcon === 'string' && this.hostContext.pluginIcon.trim()
            ? this.hostContext.pluginIcon.trim()
            : this.element.getAttribute('data-plugin-icon') || '';
        const hostOrientation = typeof this.hostContext?.orientation === 'string' && this.hostContext.orientation.trim()
            ? this.hostContext.orientation.trim()
            : this.element.getAttribute('data-host-orientation') || '';

        if (this.button) {
            this.button.title = tooltip;
            this.button.setAttribute('aria-label', tooltip);
        }
        if (this.labelEl) {
            this.labelEl.textContent = label;
        }
        if (this.iconImageEl && icon) {
            this.iconImageEl.src = icon;
        }
        if (hostOrientation) {
            this.element.setAttribute('data-host-orientation', hostOrientation);
        } else {
            this.element.removeAttribute('data-host-orientation');
        }
    }

    setMenuOpen(open) {
        const next = Boolean(open);
        if (this.button) {
            this.button.setAttribute('aria-expanded', next ? 'true' : 'false');
        }
        if (this.menu) {
            this.menu.hidden = !next;
        }
    }

    toggleMenu(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const isOpen = this.button?.getAttribute('aria-expanded') === 'true';
        this.setMenuOpen(!isOpen);
    }

    handleDocumentClick(event) {
        if (!this.element.contains(event.target)) {
            this.setMenuOpen(false);
        }
    }

    async handleNewBacklog(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        this.setMenuOpen(false);
        const host = this.getHostPresenter();
        if (!host) return;
        await this.withHostLoader(host, async () => {
            const currentFolder = this.resolveCurrentFolder(host);
            const payload = await assistOS.UI.createReactiveModal('backlog-create-file-modal', {}, true);
            const rawName = String(payload?.filename || '').trim();
            if (!rawName) {
                return;
            }

            const fileName = rawName.endsWith('.backlog') ? rawName : `${rawName}.backlog`;
            const backlogPath = host.joinPath(currentFolder, fileName);

            try {
                await host.tooling.writeFile(backlogPath, JSON.stringify([], null, 2));
                host.bumpWorkspaceVersion?.();
            } catch {
                host.showStatus?.('Failed to create backlog file in current folder.', true);
                return;
            }

            host.caches?.dirListing?.invalidate?.(host, currentFolder);
            let backlogFiles = [];
            try {
                backlogFiles = await this.listBacklogFilesInFolder(host, currentFolder);
            } catch {
                backlogFiles = [];
            }
            const normalizedPath = host.normalizePath(backlogPath);
            if (!backlogFiles.includes(normalizedPath)) {
                backlogFiles.unshift(normalizedPath);
            }

            await this.applyBacklogFilterResult(host, currentFolder, Array.from(new Set(backlogFiles)), normalizedPath);
            host.showStatus?.(`Created ${fileName}.`, false);
        });
    }

    async handleShowAll(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        this.setMenuOpen(false);
        const host = this.getHostPresenter();
        if (!host) return;
        await this.withHostLoader(host, async () => {
            const currentFolder = this.resolveCurrentFolder(host);
            let backlogFiles = [];
            try {
                backlogFiles = await this.listBacklogFilesInFolder(host, currentFolder);
            } catch {
                backlogFiles = [];
            }

            if (!backlogFiles.length) {
                host.showStatus?.('No backlog files found in current folder.', true);
                return;
            }

            await this.applyBacklogFilterResult(host, currentFolder, backlogFiles);
            if (backlogFiles.length > 1) {
                host.showStatus?.('Showing all backlog files in current folder.', false);
            }
        });
    }
}
