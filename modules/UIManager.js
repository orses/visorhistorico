/**
 * UIManager
 * Thin coordinator: delegates to GalleryRenderer and MetadataPanelRenderer.
 * Owns: Toast, multi-selection batch panel.
 */
import { DOCUMENT_TYPES, CONSERVATION_STATUSES } from './constants.js';
import GalleryRenderer from './GalleryRenderer.js';
import MetadataPanelRenderer from './MetadataPanelRenderer.js';

export default class UIManager {
    constructor(metadataManager, onSelectImage) {
        this.metadataManager = metadataManager;

        this.elements = {
            galleryGrid: document.getElementById('galleryGrid'),
            totalCount: document.getElementById('totalCount'),
            filteredCount: document.getElementById('filteredCount'),
            metadataContent: document.getElementById('metadataContent'),
            toast: document.getElementById('toast'),
            toastMessage: document.getElementById('toastMessage'),
        };

        this._gallery = new GalleryRenderer(
            metadataManager,
            this.elements.galleryGrid,
            this.elements.filteredCount,
            onSelectImage
        );

        this._panel = new MetadataPanelRenderer(
            metadataManager,
            this.elements.metadataContent
        );

        this._toastTimeout = null;
    }

    // --- Gallery delegation ---
    renderGallery(files) { return this._gallery.renderGallery(files); }
    updateSelection(filenames, forceSingle) { return this._gallery.updateSelection(filenames, forceSingle); }
    updateGalleryItem(filename) { return this._gallery.updateGalleryItem(filename); }
    applySelectionStyles() { return this._gallery.applySelectionStyles(); }

    get selectedImages() { return this._gallery.selectedImages; }
    get lastSelectedImage() { return this._gallery.lastSelectedImage; }

    // --- Panel delegation ---
    renderMetadataPanel(filename) { return this._panel.renderMetadataPanel(filename); }

    setMetadataUpdateCallback(callback) {
        this._panel.onMetadataUpdate = callback;
        this.onMetadataUpdate = callback;
    }

    setOpenOriginalCallback(callback) {
        this._gallery.onOpenOriginal = callback;
        this._panel.onOpenOriginal = callback;
        this.onOpenOriginal = callback;
    }

    // --- Toast ---
    showToast(msg, type = 'normal') {
        if (this._toastTimeout) clearTimeout(this._toastTimeout);
        this.elements.toastMessage.textContent = msg;
        this.elements.toast.style.borderColor = type === 'error' ? '#ff4757' : '#00ffa3';
        this.elements.toast.setAttribute('aria-live', 'polite');
        this.elements.toast.classList.add('show');
        this._toastTimeout = setTimeout(() => this.elements.toast.classList.remove('show'), 3000);
    }

    // --- Selection ---
    clearSelection() {
        this._gallery.selectedImages.clear();
        this._gallery.lastSelectedImage = null;
        this._gallery.applySelectionStyles();
        this.elements.metadataContent.innerHTML = '';
        if (this._gallery.onSelectImage) {
            this._gallery.onSelectImage(null, []);
        }
    }

    // --- Multi-selection batch panel ---
    renderMultiMetadataPanel(filenames) {
        if (!filenames || filenames.length === 0) return;

        this.elements.metadataContent.innerHTML = '';
        const count = filenames.length;

        const html = `
            <div class="multi-select-header" role="region" aria-label="Edición en lote de ${count} elementos">
                <div class="multi-select-header-row">
                    <h3>Edición en Lote</h3>
                    <button id="btnClearSelection" class="btn-clear-selection" title="Quitar selección (Escape)" aria-label="Quitar selección de ${count} elementos">✕ Quitar selección</button>
                </div>
                <p>${count} elementos seleccionados</p>
                <div class="multi-select-warning" role="note">
                    Los valores introducidos a continuación sobreescribirán los existentes en TODOS los elementos seleccionados.
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Aplicar a Selección</div>

                <div class="form-group-compact">
                    <label class="form-label" for="multi-mainSubject">Asunto Principal</label>
                    <input id="multi-mainSubject" type="text" class="form-control form-control-sm multi-field" data-field="mainSubject" placeholder="Dejar en blanco para no modificar">
                </div>

                <div class="form-group-compact">
                    <label class="form-label" for="multi-author">Autor</label>
                    <input id="multi-author" type="text" class="form-control form-control-sm multi-field" data-field="author" placeholder="Dejar en blanco para no modificar">
                </div>

                <div class="form-group-compact">
                    <label class="form-label" for="multi-type">Tipo de Documento</label>
                    <select id="multi-type" class="form-control form-control-sm multi-field" data-field="type">
                        <option value="">-- No modificar --</option>
                        ${DOCUMENT_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group-compact">
                    <label class="form-label" for="multi-conservation">Estado Conservación</label>
                    <select id="multi-conservation" class="form-control form-control-sm multi-field" data-field="conservationStatus">
                        <option value="">-- No modificar --</option>
                        ${CONSERVATION_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group-compact full-width">
                    <label class="form-label" for="multi-centuries">Siglos (Reemplazar, separados por coma)</label>
                    <input id="multi-centuries" type="text" class="form-control form-control-sm multi-field" data-field="centuries" placeholder="EJ: XIX, XX (Dejar en blanco para no modificar)">
                </div>

                <button id="btnApplyMulti" class="btn btn-apply-batch" aria-label="Aplicar cambios a ${count} elementos seleccionados">
                    Aplicar Cambios (${count})
                </button>
            </div>
        `;

        this.elements.metadataContent.innerHTML = html;

        const btnClear = this.elements.metadataContent.querySelector('#btnClearSelection');
        if (btnClear) {
            btnClear.onclick = () => this.clearSelection();
        }

        const btnApply = this.elements.metadataContent.querySelector('#btnApplyMulti');
        if (btnApply) {
            btnApply.onclick = () => {
                const inputs = this.elements.metadataContent.querySelectorAll('.multi-field');
                const updates = {};
                let hasChanges = false;

                inputs.forEach(input => {
                    const field = input.dataset.field;
                    const value = input.value.trim();
                    if (value !== '') {
                        hasChanges = true;
                        if (field === 'centuries') {
                            updates.centuries = value.split(',').map(s => s.trim()).filter(Boolean);
                        } else {
                            updates[field] = value;
                        }
                    }
                });

                if (!hasChanges) {
                    this.showToast('No se ha introducido ningún valor nuevo', 'normal');
                    return;
                }

                filenames.forEach(f => {
                    this.metadataManager.updateMetadata(f, updates);
                    this.updateGalleryItem(f);
                });

                inputs.forEach(input => input.value = '');
                this.showToast(`Lote actualizado: ${count} elementos modificados`, 'success');

                this._gallery._lastFilesHash = null;

                window.dispatchEvent(new CustomEvent('metadataBatchUpdated', { detail: { files: filenames, updates } }));

                requestAnimationFrame(() => {
                    this.applySelectionStyles();
                    const currentSelection = Array.from(this._gallery.selectedImages);
                    if (currentSelection.length > 1) {
                        this.renderMultiMetadataPanel(currentSelection);
                    }
                });
            };
        }
    }
}
