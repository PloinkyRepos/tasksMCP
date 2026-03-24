export class BacklogConflictModal {
    constructor(element, invalidate) {
        this.element = element;
        this.invalidate = invalidate;
        this.props = element?.props || element?._componentProxy?.props || {};
        this.state = {
            current: null,
            incoming: null
        };
        this.invalidate();
    }

    beforeRender() {}

    afterRender() {
        this.cacheElements();
        this.loadProps();
        this.renderGrid();
    }

    cacheElements() {
        this.grid = this.element.querySelector('#backlogConflictGrid');
    }

    loadProps() {
        const props = this.props || {};
        this.state.current = this.parsePayload(props.current);
        this.state.incoming = this.parsePayload(props.incoming);
    }

    parsePayload(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(decodeURIComponent(raw));
        } catch {
            return null;
        }
    }

    renderGrid() {
        if (!this.grid) return;
        const current = this.state.current || {};
        const incoming = this.state.incoming || {};
        const fields = [
            ['order', 'Order'],
            ['description', 'Description'],
            ['resolution', 'Chosen solution'],
            ['status', 'Status']
        ];
        this.grid.innerHTML = '';
        this.grid.appendChild(this.renderCard('Current version', current, fields));
        this.grid.appendChild(this.renderCard('Your changes', incoming, fields));
    }

    renderCard(title, task, fields) {
        const card = document.createElement('div');
        card.className = 'backlog-conflict-card';
        const header = document.createElement('h4');
        header.textContent = title;
        card.appendChild(header);
        for (const [key, label] of fields) {
            const wrapper = document.createElement('div');
            wrapper.className = 'backlog-conflict-field';
            const labelEl = document.createElement('span');
            labelEl.className = 'backlog-conflict-label';
            labelEl.textContent = label;
            const valueEl = document.createElement('div');
            valueEl.className = 'backlog-conflict-value';
            valueEl.textContent = String(task?.[key] || '').trim() || '—';
            wrapper.appendChild(labelEl);
            wrapper.appendChild(valueEl);
            card.appendChild(wrapper);
        }
        return card;
    }

    keepChanges() {
        assistOS.UI.closeModal(this.element, { resolution: 'keep' });
    }

    cancel() {
        assistOS.UI.closeModal(this.element, { resolution: 'cancel' });
    }
}
