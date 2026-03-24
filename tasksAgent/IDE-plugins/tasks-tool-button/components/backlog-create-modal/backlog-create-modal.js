export class BacklogCreateModal {
    constructor(element, invalidate) {
        this.element = element;
        this.invalidate = invalidate;
        this.props = element?.props || element?._componentProxy?.props || {};
        this.state = {};
        this.invalidate();
    }

    beforeRender() {}

    afterRender() {
        this.cacheElements();
        this.bindEvents();
    }

    cacheElements() {
        this.descInput = this.element.querySelector('#backlogModalDescription');
    }

    bindEvents() {
        if (!this.element.dataset.boundBacklogCreate) {
            this.element.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    this.closeModal();
                }
            });
            this.element.dataset.boundBacklogCreate = 'true';
        }
    }

    createTask() {
        const description = String(this.descInput?.value || '').trim();
        if (!description) {
            alert('Description is required.');
            return;
        }
        this.closeModalWithPayload({ description });
    }

    closeModal(_element) {
        assistOS.UI.closeModal(this.element);
    }

    closeModalWithPayload(payload) {
        assistOS.UI.closeModal(this.element, payload);
    }
}
