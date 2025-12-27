/**
 * UIManager
 * Handles Gallery rendering, List/Grid views, and Toasts.
 */
export default class UIManager {
    constructor(metadataManager, onSelectImage) {
        this.metadataManager = metadataManager;
        this.onSelectImage = onSelectImage;

        this.elements = {
            galleryGrid: document.getElementById('galleryGrid'),
            totalCount: document.getElementById('totalCount'),
            filteredCount: document.getElementById('filteredCount'),
            metadataContent: document.getElementById('metadataContent'),
            technicalInfo: document.getElementById('technicalInfo'),
            toast: document.getElementById('toast'),
            toastMessage: document.getElementById('toastMessage')
        };
    }

    // --- GALLERY RENDERING ---
    renderGallery(files) {
        this.elements.galleryGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();

        files.forEach(filename => {
            const card = this.createGalleryItem(filename);
            fragment.appendChild(card);
        });

        this.elements.galleryGrid.appendChild(fragment);

        this.elements.filteredCount.textContent = `${files.length} resultados`;
        this.elements.filteredCount.classList.remove('hidden');
    }

    createGalleryItem(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        const div = document.createElement('div');
        div.className = 'params-card';
        div.dataset.filename = filename;
        div.onclick = () => this.onSelectImage(filename);
        div.ondblclick = () => {
            if (this.onOpenOriginal) this.onOpenOriginal(filename);
        };

        // Status indicator
        let statusDot = '';
        if (meta.conservationStatus && meta.conservationStatus !== 'Sin clasificar') {
            const statusClass = 'status-' + meta.conservationStatus.toLowerCase().replace(/\s+/g, '-');
            statusDot = `<span class="status-dot ${statusClass}" title="${meta.conservationStatus}"></span>`;
        }

        // Thumbnail path
        const thumbPath = meta._previewUrl || filename; // Relative path assumption handled by browser or build

        div.innerHTML = `
            <div class="card-image-box">
                <img src="${thumbPath}" class="card-img" loading="lazy" alt="${meta.mainSubject}">
            </div>
            <div class="card-info">
                <div class="card-title" title="${meta.mainSubject}">${meta.mainSubject}</div>
                <div class="card-meta">
                    <span>${statusDot}${meta.dateRange?.start || 'S.D.'}</span>
                    <span>${meta.author || 'Anónimo'}</span>
                </div>
            </div>
        `;
        return div;
    }

    updateSelection(filename) {
        this.elements.galleryGrid.querySelectorAll('.params-card').forEach(c => c.classList.remove('selected'));
        if (filename) {
            const card = this.elements.galleryGrid.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
            if (card) card.classList.add('selected');
        }
    }

    // --- METADATA PANEL ---
    renderMetadataPanel(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        if (!meta) return;

        // Helper
        const val = (v, fallback = '-') => (v !== null && v !== undefined && v !== '') ? v : fallback;

        // Generate Dates string
        let dateStart = meta.dateRange?.start || '';
        let dateEnd = meta.dateRange?.end || '';

        // Generate Coords string
        let coordLat = (meta.coordinates && meta.coordinates.lat) ? meta.coordinates.lat.toFixed(6) : '';
        let coordLng = (meta.coordinates && meta.coordinates.lng) ? meta.coordinates.lng.toFixed(6) : '';

        // Status indicator class
        let statusClass = 'status-sin-clasificar';
        let statusTitle = 'Sin clasificar';
        if (meta.conservationStatus && meta.conservationStatus !== 'Sin clasificar') {
            statusClass = 'status-' + meta.conservationStatus.toLowerCase().replace(/\s+/g, '-');
            statusTitle = meta.conservationStatus;
        }

        let html = `
            <!-- 1. Imagen (Top absoluto) -->
            <div class="details-image-container" style="position:relative; margin-bottom:0.5rem; text-align:center; background:#000; border-radius:8px; overflow:hidden; min-height:200px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Clic para ampliar">
                <img id="detailsImage" src="${meta._previewUrl || filename}" style="max-width:100%; max-height:300px; display:block;" alt="${meta.mainSubject}">
            </div>

            <!-- 2. Technical Info Row (Debajo de imagen) -->
            <div class="meta-row-tech">
                <!-- Status (Dot only) -->
                <div class="tech-item" title="Estado: ${statusTitle}">
                    <span class="status-dot ${statusClass}"></span>
                </div>
                <!-- Size -->
                <div class="tech-item" title="Peso del archivo">
                    <span>${this.formatFileSize(meta._fileSize) || '-'}</span>
                </div>
                <!-- Dimensions -->
                <div class="tech-item" title="Dimensiones">
                    <span id="metaDim">-</span>
                </div>
                <!-- DPI -->
                <div class="tech-item" title="DPI">
                    <span>-</span> 
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Información Principal</div>
                <div class="form-group-compact">
                    <label class="form-label">Asunto Principal</label>
                    <input type="text" class="form-control form-control-sm" data-field="mainSubject" value="${val(meta.mainSubject, '')}">
                </div>
                <div class="form-group-compact">
                    <label class="form-label">Autor</label>
                    <input type="text" class="form-control form-control-sm" data-field="author" value="${val(meta.author, '')}">
                </div>
            </div>

            <div class="details-section">
                 <div class="details-section-title">Cronología y Ubicación</div>
                 <div class="details-grid">
                     <div class="form-group-compact">
                        <label class="form-label">Año Inicio</label>
                        <input type="number" class="form-control form-control-sm" data-field="dateRange.start" value="${dateStart}">
                     </div>
                     <div class="form-group-compact">
                        <label class="form-label">Año Fin</label>
                        <input type="number" class="form-control form-control-sm" data-field="dateRange.end" value="${dateEnd}">
                     </div>
                     <div class="form-group-compact full-width">
                        <label class="form-label">Siglo (separados por coma)</label>
                        <input type="text" class="form-control form-control-sm" data-field="centuries" value="${(meta.centuries || []).join(', ')}">
                     </div>
                     <div class="form-group-compact full-width">
                        <label class="form-label">Ubicación</label>
                        <input type="text" class="form-control form-control-sm" data-field="location" value="${val(meta.location, '')}">
                     </div>
                     <div class="form-group-compact">
                        <label class="form-label">Latitud</label>
                        <input type="number" step="any" class="form-control form-control-sm" data-field="coordinates.lat" value="${coordLat}">
                     </div>
                     <div class="form-group-compact">
                        <label class="form-label">Longitud</label>
                        <input type="number" step="any" class="form-control form-control-sm" data-field="coordinates.lng" value="${coordLng}">
                     </div>
                 </div>
            </div>
            
            <div class="details-section">
                <div class="details-section-title">Detalles Técnicos</div>
                <div class="details-grid">
                     <div class="form-group-compact">
                        <label class="form-label">Conservación</label>
                        <select class="form-control form-control-sm" data-field="conservationStatus">
                            <option value="Sin clasificar" ${meta.conservationStatus === 'Sin clasificar' || !meta.conservationStatus ? 'selected' : ''}>Sin clasificar</option>
                            <option value="Desaparecido" ${meta.conservationStatus === 'Desaparecido' ? 'selected' : ''}>Desaparecido</option>
                            <option value="En ruinas" ${meta.conservationStatus === 'En ruinas' ? 'selected' : ''}>En ruinas</option>
                            <option value="Modificado" ${meta.conservationStatus === 'Modificado' ? 'selected' : ''}>Modificado</option>
                            <option value="Conservado" ${meta.conservationStatus === 'Conservado' ? 'selected' : ''}>Conservado</option>
                        </select>
                     </div>
                     <div class="form-group-compact">
                        <label class="form-label">Tipo</label>
                        <select class="form-control form-control-sm" data-field="type">
                            <option value="" ${!meta.type ? 'selected' : ''}>-- Seleccionar --</option>
                            <option value="Fotografía" ${meta.type === 'Fotografía' ? 'selected' : ''}>Fotografía</option>
                            <option value="Grabado" ${meta.type === 'Grabado' ? 'selected' : ''}>Grabado</option>
                            <option value="Pintura" ${meta.type === 'Pintura' ? 'selected' : ''}>Pintura</option>
                            <option value="Plano" ${meta.type === 'Plano' ? 'selected' : ''}>Plano</option>
                            <option value="Texto" ${meta.type === 'Texto' ? 'selected' : ''}>Texto</option>
                            <option value="Dibujo" ${meta.type === 'Dibujo' ? 'selected' : ''}>Dibujo</option>
                        </select>
                     </div>
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Notas</div>
                <textarea class="form-control form-control-sm" data-field="notes" rows="3" style="resize:vertical; font-size:0.8rem;">${val(meta.notes, '')}</textarea>
            </div>

            <div style="margin-top:1.5rem; display:flex; gap:10px; flex-wrap:wrap;">
                <a href="${meta._previewUrl || filename}" download target="_blank" class="btn btn-secondary" style="flex:1; font-size:0.8rem;">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> 
                   Descargar
                </a>
                 <a href="#" id="btnOpenOriginal" class="btn btn-secondary" style="flex:1; font-size:0.8rem;">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> 
                   Ver Original
                </a>
            </div>
        `;

        this.elements.metadataContent.innerHTML = html;

        // Update dimensions when image loads
        const img = this.elements.metadataContent.querySelector('#detailsImage');
        if (img) {
            img.onload = () => {
                const dimSpan = this.elements.metadataContent.querySelector('#metaDim');
                if (dimSpan) dimSpan.textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
            };
            // If already cached
            if (img.complete) {
                const dimSpan = this.elements.metadataContent.querySelector('#metaDim');
                if (dimSpan) dimSpan.textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
            }
            // AÑADIDO: Click en imagen abre original
            img.onclick = (e) => {
                if (this.onOpenOriginal) this.onOpenOriginal(filename);
            };
        }

        // Connect Listeners
        const btnOpen = this.elements.metadataContent.querySelector('#btnOpenOriginal');
        if (btnOpen) {
            btnOpen.onclick = (e) => {
                e.preventDefault();
                if (this.onOpenOriginal) this.onOpenOriginal(filename);
            };
        }

        this.attachMetadataListeners(filename);
    }

    attachMetadataListeners(filename) {
        const inputs = this.elements.metadataContent.querySelectorAll('[data-field]');

        inputs.forEach(input => {
            // Guardar al perder el foco o al cambiar (para selects)
            const saveHandler = () => {
                const field = input.dataset.field;
                const value = input.value;
                const updates = {};

                // Parsear campos especiales
                if (field === 'dateRange.start') {
                    const current = this.metadataManager.getMetadata(filename);
                    updates.dateRange = { ...current.dateRange, start: value ? parseInt(value) : null };
                } else if (field === 'dateRange.end') {
                    const current = this.metadataManager.getMetadata(filename);
                    updates.dateRange = { ...current.dateRange, end: value ? parseInt(value) : null };
                } else if (field === 'coordinates.lat') {
                    const current = this.metadataManager.getMetadata(filename);
                    updates.coordinates = { ...current.coordinates, lat: value ? parseFloat(value) : null };
                } else if (field === 'coordinates.lng') {
                    const current = this.metadataManager.getMetadata(filename);
                    updates.coordinates = { ...current.coordinates, lng: value ? parseFloat(value) : null };
                } else if (field === 'centuries') {
                    updates.centuries = value.split(',').map(s => s.trim()).filter(Boolean);
                } else {
                    updates[field] = value;
                }

                // Llamar al callback de actualización si existe
                if (this.onMetadataUpdate) {
                    this.onMetadataUpdate(filename, updates);
                }
            };

            input.addEventListener('blur', saveHandler);
            if (input.tagName === 'SELECT') {
                input.addEventListener('change', saveHandler);
            }
        });
    }

    setMetadataUpdateCallback(callback) {
        this.onMetadataUpdate = callback;
    }

    formatFileSize(bytes) {
        if (!bytes) return 'N/D';
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KiB';
        else return (bytes / 1048576).toFixed(1) + ' MiB';
    }

    // --- TOAST ---
    showToast(msg, type = 'normal') {
        this.elements.toastMessage.textContent = msg;
        this.elements.toast.style.borderColor = type === 'error' ? '#ff4757' : '#00ffa3';
        this.elements.toast.classList.add('show');
        setTimeout(() => this.elements.toast.classList.remove('show'), 3000);
    }

    setOpenOriginalCallback(callback) {
        this.onOpenOriginal = callback;
    }
}
