/**
 * ModalManager
 * Handles all modal interactions (Image, Edit, Stats).
 */
export default class ModalManager {
    constructor(metadataManager, uiManager, statisticsService, exportService, onSaveMetadata) {
        this.metadataManager = metadataManager;
        this.uiManager = uiManager;
        this.statisticsService = statisticsService;
        this.exportService = exportService;
        this.onSaveMetadata = onSaveMetadata;

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
        this.elements.downloadDatasetBtn?.addEventListener('click', () => {
            const filename = this.exportService.downloadScientificDataset();
            this.uiManager.showToast(`Dataset descargado: ${filename}`, 'success');
        });

        // Global Keydown for ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.elements.imageModal.classList.contains('active')) this.closeImageModal();
                if (this.elements.editModal.classList.contains('active')) this.closeEditModal();
                if (this.elements.statsModal.classList.contains('active')) this.closeStatsModal();
                if (this.elements.shortcutsModal?.classList.contains('active')) this.closeShortcutsModal();
            }
        });

        // Shortcuts Modal
        this.elements.shortcutsModal = document.getElementById('shortcutsModal');
        this.elements.shortcutsBtn = document.getElementById('shortcutsBtn');
        this.elements.closeShortcutsModal = document.getElementById('closeShortcutsModal');
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
        const meta = this.metadataManager.getMetadata(filename);

        // Reset zoom state
        this.zoomState = { scale: 1, pX: 0, pY: 0 };

        this.elements.modalImage.src = meta._previewUrl || ('../' + filename);
        // User Request: No text in modal, just image
        this.elements.modalInfo.textContent = '';
        this.elements.modalInfo.style.display = 'none'; // Ensure it doesn't take space

        // Setup container styles for zoom
        this.elements.modalImage.parentElement.style.overflow = 'hidden';
        this.elements.modalImage.parentElement.className = 'modal-image-container'; // Ensure class is there
        this.elements.modalImage.style.transform = `translate(0px, 0px) scale(1)`;
        this.elements.modalImage.style.cursor = 'grab';

        this.elements.imageModal.classList.add('active');

        // Initialize Zoom Logic
        this.initZoom(this.elements.modalImage);
    }

    initZoom(img) {
        // Cleanup previous listeners if any
        if (this._zoomCleanup) this._zoomCleanup();

        const container = img.parentElement;
        let isDragging = false;
        let startX, startY;

        const updateTransform = () => {
            img.style.transform = `translate(${this.zoomState.pX}px, ${this.zoomState.pY}px) scale(${this.zoomState.scale})`;
            img.style.cursor = isDragging ? 'grabbing' : (this.zoomState.scale > 1 ? 'grab' : 'default');
        };

        // WHEEL ZOOM
        const onWheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = this.zoomState.scale * delta;

            // Limit zoom
            if (newScale < 0.5 || newScale > 10) return;

            this.zoomState.scale = newScale;
            updateTransform();
        };

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
        if (this._zoomCleanup) this._zoomCleanup();
    }

    // --- EDIT MODAL ---
    openEditModal(filename) {
        this.currentEditFile = filename;
        const meta = this.metadataManager.getMetadata(filename);

        let html = '<div class="edit-grid-layout">';

        // Define fields to edit
        const fields = [
            { id: 'mainSubject', label: 'Asunto Principal', type: 'text' },
            { id: 'author', label: 'Autor', type: 'text' },
            { id: 'dateRange.start', label: 'Año Inicio', type: 'number' },
            { id: 'dateRange.end', label: 'Año Fin', type: 'number' },
            { id: 'reign', label: 'Reinado/Periodo', type: 'text' },
            { id: 'location', label: 'Ubicación', type: 'text' },
            { id: 'coordinates.lat', label: 'Latitud', type: 'number', step: 'any' },
            { id: 'coordinates.lng', label: 'Longitud', type: 'number', step: 'any' },
            { id: 'type', label: 'Tipo Documento', type: 'select', options: ['Fotografía', 'Grabado', 'Pintura', 'Plano', 'Texto', 'Dibujo'] },
            { id: 'conservationStatus', label: 'Estado Conservación', type: 'select', options: ['Desaparecido', 'En ruinas', 'Modificado', 'Conservado'] },
            // Centuries is array, handled as text for simplicity
            { id: 'centuries', label: 'Siglos (separados por coma)', type: 'text' },
            { id: 'notes', label: 'Notas', type: 'textarea', full: true }
        ];

        fields.forEach(field => {
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
                html += `<textarea class="form-control" data-field="${field.id}">${value || ''}</textarea>`;
            } else {
                html += `<input type="${field.type}" class="form-control" data-field="${field.id}" value="${value || ''}" ${field.step ? `step="${field.step}"` : ''}>`;
            }

            html += `</div>`;
        });

        html += '</div>';

        // Add Technical Info in Modal (read-only)
        html += `<div id="modalTechnicalInfo" style="margin-top:2rem; padding-top:1rem; border-top:1px solid var(--border-light);"></div>`;

        this.elements.editModalContent.innerHTML = html;
        this.elements.editModal.classList.add('active');

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

    // --- STATS MODAL ---
    openStatsModal() {
        const stats = this.statisticsService.generateStatistics();
        let html = '';

        // Helper
        const romanToInt = (s) => {
            if (s === 'Sin siglo') return 9999;
            const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
            return [...s].reduce((r, c, i, a) => {
                const v = map[c];
                return v < map[a[i + 1]] ? r - v : r + v;
            }, 0);
        };

        // Render sections (reused logic from original app.js)
        // 1. Total
        html += `
            <div class="stats-card">
                <h3 class="stats-card-title">Total</h3>
                <div class="stats-number">${stats.total}</div>
                <div class="stats-subtitle">Catalogados</div>
            </div>
        `;

        // 2. Type
        html += `
            <div class="stats-card">
                <h3 class="stats-card-title">Por Tipo de Documento</h3>
                ${Object.entries(stats.byType).sort(([, a], [, b]) => b - a).map(([k, v]) => `
                    <div class="stats-row"><span class="stats-label">${k}</span><span class="stats-value">${v}</span></div>
                `).join('')}
            </div>
        `;

        // 3. Extension
        html += `
            <div class="stats-card">
                <h3 class="stats-card-title">Por Extensión</h3>
                ${Object.entries(stats.byExtension).sort(([, a], [, b]) => b - a).map(([k, v]) => `
                    <div class="stats-row"><span class="stats-label">${k.toUpperCase()}</span><span class="stats-value">${v}</span></div>
                `).join('')}
            </div>
        `;

        // 4. Century
        html += `
            <div class="stats-card">
                <h3 class="stats-card-title">Por Siglo</h3>
                ${Object.entries(stats.byCentury).sort(([a], [b]) => {
            // Simple sort fix for consistency
            if (a === 'Sin siglo') return 1;
            if (b === 'Sin siglo') return -1;
            return romanToInt(a) - romanToInt(b);
        }).map(([k, v]) => `
                    <div class="stats-row"><span class="stats-label">${k}</span><span class="stats-value">${v}</span></div>
                `).join('')}
            </div>
        `;

        // 5. Conservation
        html += `
            <div class="stats-card">
                <h3 class="stats-card-title">Por Estado de Conservación</h3>
                ${Object.entries(stats.byConservation).sort(([, a], [, b]) => b - a).map(([k, v]) => `
                    <div class="stats-row"><span class="stats-label">${k}</span><span class="stats-value">${v}</span></div>
                `).join('')}
            </div>
        `;

        // 6. Coordinates
        const coordsPercent = stats.total ? ((stats.withCoordinates / stats.total) * 100).toFixed(1) : 0;
        html += `
            <div class="stats-card">
                <h3 class="stats-card-title">Por Coordenadas</h3>
                <div class="stats-row"><span class="stats-label">Con Coordenadas</span><span class="stats-value">${stats.withCoordinates} (${coordsPercent}%)</span></div>
                <div class="stats-row"><span class="stats-label">Sin Coordenadas</span><span class="stats-value">${stats.withoutCoordinates}</span></div>
            </div>
        `;

        this.elements.statsModalContent.innerHTML = html;
        this.elements.statsModal.classList.add('active');
    }

    closeStatsModal() {
        this.elements.statsModal.classList.remove('active');
    }
}
