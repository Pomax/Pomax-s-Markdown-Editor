/**
 * @fileoverview Preferences modal dialog.
 * Displays a modal overlay that lets the user adjust application settings.
 * Settings are persisted to SQLite via the main-process IPC bridge.
 */

/// <reference path="../../../types.d.ts" />

/**
 * A modal dialog for editing application preferences.
 */
export class PreferencesModal {
    constructor() {
        /** @type {HTMLDialogElement|null} */
        this.dialog = null;

        /** @type {boolean} */
        this._built = false;
    }

    /**
     * Lazily builds the dialog DOM the first time it is needed.
     */
    _build() {
        if (this._built) return;
        this._built = true;

        const dialog = document.createElement('dialog');
        dialog.className = 'preferences-dialog';
        dialog.setAttribute('aria-label', 'Preferences');

        dialog.innerHTML = `
			<form method="dialog" class="preferences-form">
				<header class="preferences-header">
					<h2>Preferences</h2>
					<button type="button" class="preferences-close" aria-label="Close">&times;</button>
				</header>
				<div class="preferences-body">
					<p class="preferences-empty">No settings available yet.</p>
				</div>
				<footer class="preferences-footer">
					<button type="button" class="preferences-btn preferences-btn--cancel">Cancel</button>
					<button type="submit" class="preferences-btn preferences-btn--save">Save</button>
				</footer>
			</form>
		`;

        // Close on × or Cancel
        const closeBtn = dialog.querySelector('.preferences-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        const cancelBtn = dialog.querySelector('.preferences-btn--cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.close());
        }

        // Save handler (no-op for now, we have no settings yet)
        const form = dialog.querySelector('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._save();
            });
        }

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                this.close();
            }
        });

        // Close on Escape key
        dialog.addEventListener('cancel', () => {
            this.close();
        });

        document.body.appendChild(dialog);
        this.dialog = dialog;
    }

    /**
     * Opens the preferences modal.
     */
    open() {
        this._build();
        if (this.dialog && !this.dialog.open) {
            this.dialog.showModal();
        }
    }

    /**
     * Closes the preferences modal.
     */
    close() {
        if (this.dialog?.open) {
            this.dialog.close();
        }
    }

    /**
     * Saves the current form values to the settings store.
     * Placeholder – will be extended when settings are added.
     */
    async _save() {
        // No settings to persist yet.
        this.close();
    }
}
