/**
 * ModalManager
 * Handles all modal interactions (Image, Edit, Stats).
 */
import { DOCUMENT_TYPES, CONSERVATION_STATUSES } from './constants.js';
export default class ModalManager {
    constructor(metadataManager, uiManager, statisticsService, exportService, onSaveMetadata) {
        this.metadataManager = metadataManager;
        this.uiManager = uiManager;
        this.statisticsService = statisticsService;
        this.exportService = exportService;
        this.onSaveMetadata = onSaveMetadata;
        this.onImageDisabled = null;
        this.getFilteredImages = null; // Optional: getter for filtered images list
        this.getAllImages = null;       // Optional: getter for all current images list

        this.elements = {
            imageModal: document.getElementById('imageModal'),
            modalImage: document.getElementById('modalImage'),
            modalInfo: document.getElementById('modalInfo'),
            closeModalBtn: document.getElementById('closeModalBtn'),

            editModal: document.getElementById('editModal'),
            editModalContent: document.getElementById('editModalContent'),
            closeEditModal: document.getElementById('closeEditModal'),
            cancelEditBtn: document.getElementById('cancelEditBtn'),
            saveEditBtn: document.getElementById('saveEditBtn'),

            statsModal: document.getElementById('statsModal'),
            statsModalContent: document.getElementById('statsModalContent'),
            closeStatsModal: document.getElementById('closeStatsModal'),
            closeStatsBtn: document.getElementById('closeStatsBtn'),
            downloadDatasetBtn: document.getElementById('downloadDatasetBtn'),

            exportModal: document.getElementById('exportModal'),
            closeExportModal: document.getElementById('closeExportModal'),
            cancelExportBtn: document.getElementById('cancelExportBtn'),
            confirmExportBtn: document.getElementById('confirmExportBtn'),

            helpModal: document.getElementById('helpModal'),
            closeHelpModal: document.getElementById('closeHelpModal'),
            closeHelpBtn: document.getElementById('closeHelpBtn'),
            helpBtn: document.getElementById('helpBtn'),

            statsBtn: document.getElementById('statsBtn')
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Image Modal
        this.elements.closeModalBtn?.addEventListener('click', () => this.elements.imageModal.classList.remove('active'));
        this.elements.imageModal?.addEventListener('click', e => {
            if (e.target === this.elements.imageModal) this.elements.imageModal.classList.remove('active');
        });
        document.getElementById('rotateCWBtn')?.addEventListener('click', (e) => { e.stopPropagation(); this._applyRotation(90); });
        document.getElementById('rotateCCWBtn')?.addEventListener('click', (e) => { e.stopPropagation(); this._applyRotation(-90); });

        // Edit Modal
        this.elements.closeEditModal?.addEventListener('click', () => this.closeEditModal());
        this.elements.cancelEditBtn?.addEventListener('click', () => this.closeEditModal());
        this.elements.saveEditBtn?.addEventListener('click', () => this.saveEdit());
        window.addEventListener('click', (e) => {
            if (e.target === this.elements.editModal) this.closeEditModal();
        });

        // Stats Modal
        this.elements.statsBtn?.addEventListener('click', () => this.openStatsModal());
        this.elements.closeStatsModal?.addEventListener('click', () => this.closeStatsModal());
        this.elements.closeStatsBtn?.addEventListener('click', () => this.closeStatsModal());
        // Descarga desde modal de estadísticas → abre el modal de exportación
        this.elements.downloadDatasetBtn?.addEventListener('click', () => {
            this.closeStatsModal();
            this.openExportModal();
        });

        // Export Modal
        this.elements.closeExportModal?.addEventListener('click', () => this.closeExportModal());
        this.elements.cancelExportBtn?.addEventListener('click', () => this.closeExportModal());
        this.elements.exportModal?.addEventListener('click', e => {
            if (e.target === this.elements.exportModal) this.closeExportModal();
        });
        this.elements.confirmExportBtn?.addEventListener('click', () => this._doExport());

        // Help Modal
        this.elements.helpBtn?.addEventListener('click', () => this.openHelpModal());
        this.elements.closeHelpModal?.addEventListener('click', () => this.closeHelpModal());
        this.elements.closeHelpBtn?.addEventListener('click', () => this.closeHelpModal());
        this.elements.helpModal?.addEventListener('click', e => {
            if (e.target === this.elements.helpModal) this.closeHelpModal();
        });

        // Global Keydown for ESC and Zoom shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.elements.imageModal.classList.contains('active')) this.closeImageModal();
                if (this.elements.editModal.classList.contains('active')) this.closeEditModal();
                if (this.elements.statsModal.classList.contains('active')) this.closeStatsModal();
                if (this.elements.shortcutsModal?.classList.contains('active')) this.closeShortcutsModal();
                if (this.elements.exportModal?.classList.contains('active')) this.closeExportModal();
                if (this.elements.helpModal?.classList.contains('active')) this.closeHelpModal();
            }

            // Atajos de Edición (solo si el modal de edición está abierto)
            if (this.isEditModalOpen() && e.ctrlKey) {
                if (e.key.toLowerCase() === 'g' || e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.saveEdit();
                }
            }

            // Atajos de Zoom (solo si el visor está abierto)
            if (this.isImageModalOpen() && e.ctrlKey) {
                if (e.key === '0') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.resetZoom();
                } else if (e.key === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.fitToScreen();
                }
            }
        });

        // Shortcuts Modal
        this.elements.shortcutsModal = document.getElementById('shortcutsModal');
        this.elements.shortcutsBtn = document.getElementById('shortcutsBtn');
        this.elements.closeShortcutsModal = document.getElementById('closeShortcutsModalBtn');
        this.elements.closeShortcutsBtnAction = document.getElementById('closeShortcutsBtn');

        this.elements.shortcutsBtn?.addEventListener('click', () => this.openShortcutsModal());
        this.elements.closeShortcutsModal?.addEventListener('click', () => this.closeShortcutsModal());
        this.elements.closeShortcutsBtnAction?.addEventListener('click', () => this.closeShortcutsModal());
    }

    openShortcutsModal() {
        this.elements.shortcutsModal.classList.add('active');
    }

    closeShortcutsModal() {
        this.elements.shortcutsModal.classList.remove('active');
    }

    // --- IMAGE MODAL ---
    openImageModal(filename) {
        this.currentImageFile = filename;
        const meta = this.metadataManager.getMetadata(filename);

        // Reset zoom state, preserve saved rotation
        this.zoomState = { scale: 1, pX: 0, pY: 0, rotation: meta.rotation || 0 };

        this.elements.modalImage.src = meta._previewUrl || ('../' + filename);
        this.elements.modalInfo.textContent = '';
        this.elements.modalInfo.style.display = 'none';

        // Setup container styles for zoom
        this.elements.modalImage.parentElement.style.overflow = 'hidden';
        this.elements.modalImage.parentElement.className = 'modal-image-container';
        this.elements.modalImage.style.cursor = 'grab';

        this.elements.imageModal.classList.add('active');

        // Initialize Zoom Logic
        this.initZoom(this.elements.modalImage);
    }

    _applyRotation(delta) {
        if (!this.currentImageFile) return;
        this.zoomState.rotation = ((this.zoomState.rotation + delta) % 360 + 360) % 360;
        if (this._updateZoomTransform) this._updateZoomTransform();
        this.metadataManager.updateMetadata(this.currentImageFile, { rotation: this.zoomState.rotation });
        // Notify app to refresh card and panel
        window.dispatchEvent(new CustomEvent('imageRotated', { detail: { filename: this.currentImageFile, rotation: this.zoomState.rotation } }));
    }

    initZoom(img) {
        // Cleanup previous listeners if any
        if (this._zoomCleanup) this._zoomCleanup();

        const container = img.parentElement;
        let isDragging = false;
        let startX, startY;

        const updateTransform = () => {
            const rot = this.zoomState.rotation || 0;
            img.style.transform = `rotate(${rot}deg) translate(${this.zoomState.pX}px, ${this.zoomState.pY}px) scale(${this.zoomState.scale})`;
            img.style.cursor = isDragging ? 'grabbing' : (this.zoomState.scale > 1 ? 'grab' : 'default');
        };

        // WHEEL ZOOM (Restaurado a comportamiento original sin Ctrl)
        const onWheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = this.zoomState.scale * delta;

            // Limit zoom
            if (newScale < 0.1 || newScale > 20) return;

            this.zoomState.scale = newScale;
            updateTransform();
        };

        // Guardar referencia para actualizaciones externas
        this._updateZoomTransform = updateTransform;

        // DRAG PAN
        const onMouseDown = (e) => {
            if (this.zoomState.scale <= 1 && !this.zoomState.pX && !this.zoomState.pY) return; // Only drag if zoomed or moved
            isDragging = true;
            startX = e.clientX - this.zoomState.pX;
            startY = e.clientY - this.zoomState.pY;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            this.zoomState.pX = e.clientX - startX;
            this.zoomState.pY = e.clientY - startY;
            updateTransform();
        };

        const onMouseUp = () => {
            isDragging = false;
            container.style.cursor = 'grab';
        };

        container.addEventListener('wheel', onWheel);
        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        this._zoomCleanup = () => {
            container.removeEventListener('wheel', onWheel);
            container.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }

    closeImageModal() {
        this.elements.imageModal.classList.remove('active');
        this.currentImageFile = null;
        if (this._zoomCleanup) this._zoomCleanup();
        this._updateZoomTransform = null;
    }

    resetZoom() {
        this.zoomState = { scale: 1, pX: 0, pY: 0 };
        if (this._updateZoomTransform) this._updateZoomTransform();
    }

    fitToScreen() {
        if (!this.elements.modalImage) return;
        
        const img = this.elements.modalImage;
        const container = img.parentElement;
        
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        
        const ratioW = containerW / imgW;
        const ratioH = containerH / imgH;
        
        // El menor de los dos para que quepa (contain)
        this.zoomState.scale = Math.min(ratioW, ratioH, 1);
        this.zoomState.pX = 0;
        this.zoomState.pY = 0;
        
        if (this._updateZoomTransform) this._updateZoomTransform();
    }

    isImageModalOpen() {
        return this.elements.imageModal.classList.contains('active');
    }

    isEditModalOpen() {
        return this.elements.editModal.classList.contains('active');
    }

    // --- EDIT MODAL ---
    openEditModal(filename) {
        this.currentEditFile = filename;
        const meta = this.metadataManager.getMetadata(filename);

        let html = '<div class="edit-sections-container">';

        // Secciones lógicas
        const sections = [
            {
                title: 'Identificación',
                fields: [
                    { id: 'mainSubject', label: 'Asunto Principal', type: 'text' },
                    { id: 'author', label: 'Autor', type: 'text' },
                    { id: 'type', label: 'Tipo Documento', type: 'select', options: DOCUMENT_TYPES },
                    { id: 'conservationStatus', label: 'Estado Conservación', type: 'select', options: CONSERVATION_STATUSES }
                ]
            },
            {
                title: 'Cronología',
                fields: [
                    { id: 'dateRange.start', label: 'Año Inicio', type: 'number' },
                    { id: 'dateRange.end', label: 'Año Fin', type: 'number' },
                    { id: 'centuries', label: 'Siglos (separados por coma)', type: 'text' }
                ]
            },
            {
                title: 'Ubicación y Periodo',
                fields: [
                    { id: 'location', label: 'Ubicación', type: 'text' },
                    { id: 'reign', label: 'Reinado/Periodo', type: 'text' },
                    { id: 'coordinates.lat', label: 'Latitud', type: 'number', step: 'any' },
                    { id: 'coordinates.lng', label: 'Longitud', type: 'number', step: 'any' }
                ]
            },
            {
                title: 'Fuentes y Archivo',
                fields: [
                    { id: 'sourceUrl', label: 'Enlace a la fuente', type: 'text' },
                    { id: 'authorUrl', label: 'Referencia Autor', type: 'text' },
                    { id: 'license', label: 'Licencia', type: 'text' },
                    { id: 'fullPath', label: 'Ruta completa del archivo', type: 'textarea', full: true, rows: 4, readonly: true }
                ]
            },
            {
                title: 'Notas e Información Adicional',
                fields: [
                    { id: 'notes', label: 'Notas', type: 'textarea', full: true, rows: 4 }
                ]
            }
        ];

        sections.forEach(section => {
            html += `
                <div class="edit-section">
                    <h3 class="section-title">${section.title}</h3>
                    <div class="section-fields">
            `;

            section.fields.forEach(field => {
                let value = '';
                // Deep access
                if (field.id.includes('.')) {
                    const parts = field.id.split('.');
                    value = meta[parts[0]] ? meta[parts[0]][parts[1]] : '';
                } else {
                    value = meta[field.id];
                }
                if (field.id === 'centuries') value = (meta.centuries || []).join(', ');

                html += `
                    <div class="form-group ${field.full ? 'full-width' : ''}">
                        <label class="form-label">${field.label}</label>
                `;

                if (field.type === 'select') {
                    html += `<select class="form-control" data-field="${field.id}">`;
                    html += `<option value="">-- Seleccionar --</option>`;
                    field.options.forEach(opt => {
                        const selected = value === opt ? 'selected' : '';
                        html += `<option value="${opt}" ${selected}>${opt}</option>`;
                    });
                    html += `</select>`;
                } else if (field.type === 'textarea') {
                    html += `<textarea class="form-control" data-field="${field.id}" ${field.rows ? `rows="${field.rows}"` : ''} ${field.readonly ? 'readonly' : ''}>${value || ''}</textarea>`;
                } else {
                    html += `<input type="${field.type}" class="form-control" data-field="${field.id}" value="${value || ''}" ${field.step ? `step="${field.step}"` : ''}>`;
                }

                html += `</div>`;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += '</div>';

        // Add Technical Info in Modal (read-only)
        html += `<div id="modalTechnicalInfo" class="edit-modal-tech-info"></div>`;

        // Disable action
        html += `<div class="edit-modal-disable-row"><button id="btnDisableInModal" class="btn btn-danger btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>Dar de baja</button></div>`;

        this.elements.editModalContent.innerHTML = html;
        this.elements.editModal.classList.add('active');

        this.elements.editModalContent.querySelector('#btnDisableInModal')?.addEventListener('click', () => {
            if (confirm(`¿Dar de baja "${filename}"?\nLa imagen quedará excluida de la colección en esta sesión. Al volver a cargar la carpeta será reconocida de nuevo.`)) {
                if (this.onImageDisabled) this.onImageDisabled(filename);
                this.closeEditModal();
            }
        });


        // Trigger technical info update if possible (requires image element reference, which we might not have easily here without loading it)
        // For this refactor, we might skip the dynamic image loading for technical info inside edit modal to keep it simple, 
        // or load it hiddenly.
    }

    closeEditModal() {
        this.elements.editModal.classList.remove('active');
        this.currentEditFile = null;
    }

    saveEdit() {
        if (!this.currentEditFile) return;

        const inputs = this.elements.editModalContent.querySelectorAll('[data-field]');
        const updates = {
            dateRange: { ...this.metadataManager.getMetadata(this.currentEditFile).dateRange },
            coordinates: { ...this.metadataManager.getMetadata(this.currentEditFile).coordinates }
        };

        inputs.forEach(input => {
            const field = input.dataset.field;
            const value = input.value;

            if (field === 'dateRange.start') updates.dateRange.start = parseInt(value) || null;
            else if (field === 'dateRange.end') updates.dateRange.end = parseInt(value) || null;
            else if (field === 'coordinates.lat') updates.coordinates.lat = value ? parseFloat(value) : null;
            else if (field === 'coordinates.lng') updates.coordinates.lng = value ? parseFloat(value) : null;
            else if (field === 'centuries') updates.centuries = value.split(',').map(s => s.trim()).filter(Boolean);
            else updates[field] = value;
        });

        this.onSaveMetadata(this.currentEditFile, updates);
        this.closeEditModal();
    }

    // --- COMPARATOR MODAL ---
    openComparatorModal(filenameA, filenameB) {
        const metaA = this.metadataManager.getMetadata(filenameA);
        const metaB = this.metadataManager.getMetadata(filenameB);

        const modal = document.getElementById('comparatorModal');
        if (!modal) return;

        document.getElementById('comparatorImgA').src = metaA._previewUrl || filenameA;
        document.getElementById('comparatorImgB').src = metaB._previewUrl || filenameB;

        const infoHtml = (meta) => `
            <div class="comp-title">${meta.mainSubject || 'Sin título'}</div>
            <div class="comp-meta">${meta.dateRange?.start || ''}${meta.dateRange?.end && meta.dateRange.end !== meta.dateRange.start ? '–' + meta.dateRange.end : ''} ${(meta.centuries||[]).join(', ')}</div>
            ${meta.location ? `<div class="comp-location">${meta.location}</div>` : ''}
            ${meta.author ? `<div class="comp-author">${meta.author}</div>` : ''}
        `;
        document.getElementById('comparatorInfoA').innerHTML = infoHtml(metaA);
        document.getElementById('comparatorInfoB').innerHTML = infoHtml(metaB);

        document.getElementById('closeComparatorBtn').onclick = () => modal.classList.remove('active');
        modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };
        modal.classList.add('active');
    }

    // --- EXPORT MODAL ---
    openExportModal() {
        const filtered = this.getFilteredImages ? this.getFilteredImages() : [];
        const selected = this.getSelectedImages ? this.getSelectedImages() : [];
        const total    = this.getAllImages ? this.getAllImages() : [];

        // Actualizar contadores
        document.getElementById('exportFilteredCount').textContent = filtered.length;
        document.getElementById('exportSelectedCount').textContent = selected.length;

        // Deshabilitar opciones sin datos
        const filteredLabel = document.getElementById('exportScopeFilteredLabel');
        const selectedLabel = document.getElementById('exportScopeSelectedLabel');
        const filteredRadio = filteredLabel?.querySelector('input');
        const selectedRadio = selectedLabel?.querySelector('input');

        if (filteredRadio) filteredRadio.disabled = filtered.length === 0 || filtered.length === total.length;
        if (selectedRadio) selectedRadio.disabled = selected.length === 0;

        // Reset selección a "todos"
        const allRadio = this.elements.exportModal?.querySelector('input[value="all"]');
        if (allRadio) allRadio.checked = true;
        const csvRadio = this.elements.exportModal?.querySelector('input[value="csv"]');
        if (csvRadio) csvRadio.checked = true;

        this.elements.exportModal.classList.add('active');
    }

    closeExportModal() {
        this.elements.exportModal?.classList.remove('active');
    }

    _doExport() {
        const scope  = this.elements.exportModal?.querySelector('input[name="exportScope"]:checked')?.value  || 'all';
        const format = this.elements.exportModal?.querySelector('input[name="exportFormat"]:checked')?.value || 'csv';

        let filenames = null;
        if (scope === 'filtered') {
            filenames = this.getFilteredImages ? this.getFilteredImages() : null;
        } else if (scope === 'selected') {
            filenames = this.getSelectedImages ? this.getSelectedImages() : null;
        }

        let downloadedName;
        if (format === 'csv') {
            downloadedName = this.exportService.downloadScientificDataset(filenames);
        } else {
            downloadedName = this.metadataManager.exportToJSON(filenames || undefined);
        }

        this.closeExportModal();
        this.uiManager.showToast(`Descargado: ${downloadedName || 'archivo'}`, 'success');
    }

    // --- HELP MODAL ---
    openHelpModal() {
        this.elements.helpModal?.classList.add('active');
    }

    closeHelpModal() {
        this.elements.helpModal?.classList.remove('active');
    }

    // --- STATS MODAL ---
    openStatsModal() {
        // En lugar de texto estático, ahora llamamos a la vista HTML enriquecida con gráficos 
        const html = this.statisticsService.generateStatisticsHTML();
        this.elements.statsModalContent.innerHTML = html;
        this.elements.statsModal.classList.add('active');
    }

    closeStatsModal() {
        this.elements.statsModal.classList.remove('active');
    }
}
