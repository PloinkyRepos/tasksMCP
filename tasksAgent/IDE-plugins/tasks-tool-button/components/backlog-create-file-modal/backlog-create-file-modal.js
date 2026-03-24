export class BacklogCreateFileModal {
    constructor(element, invalidate) {
        this.element = element;
        this.invalidate = invalidate;
        this.invalidate();
    }

    beforeRender() {}

    afterRender() {
        this.cacheElements();
    }

    cacheElements() {
        this.nameInput = this.element.querySelector('#backlogFileNameInput');
        if (this.nameInput) {
            setTimeout(() => this.nameInput?.focus(), 0);
        }
    }

    createFile() {
        const raw = String(this.nameInput?.value || '').trim();
        if (!raw) {
            alert('File name is required.');
            return;
        }
        if (raw.includes('/') || raw.includes('\\')) {
            alert('Use a file name only, without folders.');
            return;
        }
        assistOS.UI.closeModal(this.element, { filename: raw });
    }

    closeModal() {
        assistOS.UI.closeModal(this.element, null);
    }
}
