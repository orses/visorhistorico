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
        
        // Multi-selection state
        this.selectedImages = new Set();
        this.lastSelectedImage = null;
    }

    // --- GALLERY RENDERING ---
    async renderGallery(files) {
        // Cancelar cualquier renderizado previo que pudiera estar en curso
        if (this._renderContext) {
            this._renderContext.cancelled = true;
        }

        // Si la lista es idéntica a la que ya tenemos, no hacemos nada drástico
        // Esto previene el parpadeo constante si applyFilters se llama sin cambios reales
        if (this._lastFiles && JSON.stringify(this._lastFiles) === JSON.stringify(files)) {
            console.log('UIManager: Galería idéntica, omitiendo re-renderizado completo.');
            return;
        }
        this._lastFiles = [...files];

        this.elements.galleryGrid.innerHTML = '';
        const context = { cancelled: false };
        this._renderContext = context;

        const batchSize = 20;
        let index = 0;

        const renderBatch = async () => {
            if (context.cancelled) return;

            const fragment = document.createDocumentFragment();
            const end = Math.min(index + batchSize, files.length);
            
            for (let i = index; i < end; i++) {
                const card = this.createGalleryItem(files[i]);
                fragment.appendChild(card);
            }

            this.elements.galleryGrid.appendChild(fragment);
            index = end;

            if (index < files.length) {
                // Pequeña pausa para dejar que el navegador respire
                requestAnimationFrame(() => renderBatch());
            } else {
                this.elements.filteredCount.innerHTML = `<b>${files.length}</b> resultados`;
                this.elements.filteredCount.classList.remove('hidden');
                // IMPORTANTE: Restaurar estilos de selección en los nuevos elementos del DOM
                this.applySelectionStyles();
            }
        };

        if (files.length > 0) {
            await renderBatch();
        } else {
            this.elements.filteredCount.textContent = `0 resultados`;
            this.elements.filteredCount.classList.add('hidden');
        }
    }

    createGalleryItem(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        const div = document.createElement('div');
        div.className = 'params-card';
        div.dataset.filename = filename;
        div.onclick = (e) => this.handleImageClick(e, filename);
        div.ondblclick = () => {
            if (this.onOpenOriginal) this.onOpenOriginal(filename);
        };

        // Status indicator
        let statusDot = '';
        const status = meta.conservationStatus || 'Sin clasificar';
        const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '-');
        statusDot = `<span class="status-dot ${statusClass}" title="${status}"></span>`;

        // Thumbnail path
        const thumbPath = meta._previewUrl || filename; // Relative path assumption handled by browser or build
        
        const imageHTML = meta._isProcessing ? 
            `<div class="skeleton-box"></div>` : 
            `<img src="${thumbPath}" class="card-img" loading="lazy" alt="${meta.mainSubject}">`;

        div.innerHTML = `
            <div class="card-image-box">
                ${imageHTML}
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

    handleImageClick(e, filename) {
        if (e.shiftKey && this.lastSelectedImage) {
            // Shift click: select range
            const cards = Array.from(this.elements.galleryGrid.children);
            const startIdx = cards.findIndex(c => c.dataset.filename === this.lastSelectedImage);
            const endIdx = cards.findIndex(c => c.dataset.filename === filename);
            
            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                
                if (!e.ctrlKey && !e.metaKey) {
                    this.selectedImages.clear();
                }
                
                for (let i = min; i <= max; i++) {
                    this.selectedImages.add(cards[i].dataset.filename);
                }
            }
            this.lastSelectedImage = filename;
        } else if (e.ctrlKey || e.metaKey) {
            // Ctrl click: toggle selection
            if (this.selectedImages.has(filename)) {
                this.selectedImages.delete(filename);
                if (this.lastSelectedImage === filename) {
                    this.lastSelectedImage = this.selectedImages.size > 0 ? Array.from(this.selectedImages).pop() : null;
                }
            } else {
                this.selectedImages.add(filename);
                this.lastSelectedImage = filename;
            }
        } else {
            // Normal click: single selection
            this.selectedImages.clear();
            this.selectedImages.add(filename);
            this.lastSelectedImage = filename;
        }

        this.applySelectionStyles();
        
        // Disparamos el callback principal
        // Mandamos null si la selección se quedó vacía, sino el último, y la lista completa
        const primaryFocus = this.lastSelectedImage;
        const allSelected = Array.from(this.selectedImages);
        this.onSelectImage(primaryFocus, allSelected);
    }

    applySelectionStyles() {
        this.elements.galleryGrid.querySelectorAll('.params-card').forEach(c => {
            const file = c.dataset.filename;
            if (this.selectedImages.has(file)) {
                c.classList.add('selected');
            } else {
                c.classList.remove('selected');
            }
        });
    }

    updateSelection(filenames) {
        this.selectedImages.clear();
        
        // Backward compatibility if single string passed
        if (typeof filenames === 'string') {
            this.selectedImages.add(filenames);
            this.lastSelectedImage = filenames;
        } else if (Array.isArray(filenames)) {
            filenames.forEach(f => this.selectedImages.add(f));
            if (filenames.length > 0) this.lastSelectedImage = filenames[filenames.length - 1];
        }

        this.applySelectionStyles();
        
        // Scroll to the last selected
        if (this.lastSelectedImage) {
            const card = this.elements.galleryGrid.querySelector(`[data-filename="${CSS.escape(this.lastSelectedImage)}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        // NOTIFICAR AL CONTROLADOR (Fix sincronización mapa/atajos -> panel detalles)
        if (this.onSelectImage) {
            this.onSelectImage(this.lastSelectedImage, Array.from(this.selectedImages));
        }
    }

    // --- OPTIMIZACIÓN: Actualizar solo un ítem de la galería ---
    updateGalleryItem(filename) {
        const card = this.elements.galleryGrid.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
        if (!card) return;

        const meta = this.metadataManager.getMetadata(filename);

        // Status indicator
        const status = meta.conservationStatus || 'Sin clasificar';
        const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '-');

        // Actualizar título
        const titleEl = card.querySelector('.card-title');
        if (titleEl) {
            titleEl.textContent = meta.mainSubject || 'Sin título';
            titleEl.title = meta.mainSubject || '';
        }

        // Actualizar meta (año, autor)
        const metaEl = card.querySelector('.card-meta');
        if (metaEl) {
            metaEl.innerHTML = `
                <span><span class="status-dot ${statusClass}" title="${status}"></span>${meta.dateRange?.start || 'S.D.'}</span>
                <span>${meta.author || 'Anónimo'}</span>
            `;
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
                     <div class="form-group-compact full-width">
                        <label class="form-label">Reinado/Periodo</label>
                        <input type="text" class="form-control form-control-sm" data-field="reign" value="${val(meta.reign, '')}">
                     </div>
                     <div class="form-group-compact full-width">
                        <label class="form-label">Etiquetas (separadas por coma)</label>
                        <input type="text" class="form-control form-control-sm" data-field="tags" value="${(meta.tags || []).join(', ')}">
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
                <div class="details-section-title">Referencias y Archivo</div>
                <div class="form-group-compact full-width">
                    <label class="form-label">Enlace a la fuente</label>
                    <div style="display:flex; gap:5px;">
                        <input type="text" class="form-control form-control-sm" data-field="sourceUrl" value="${val(meta.sourceUrl, '')}" style="flex:1;">
                        ${meta.sourceUrl ? `<a href="${meta.sourceUrl}" target="_blank" class="btn btn-secondary btn-sm" style="padding:0 8px; display:flex; align-items:center;" title="Abrir fuente"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
                    </div>
                </div>
                <div class="form-group-compact full-width">
                    <label class="form-label">Referencia del autor</label>
                    <div style="display:flex; gap:5px;">
                        <input type="text" class="form-control form-control-sm" data-field="authorUrl" value="${val(meta.authorUrl, '')}" style="flex:1;">
                        ${meta.authorUrl ? `<a href="${meta.authorUrl}" target="_blank" class="btn btn-secondary btn-sm" style="padding:0 8px; display:flex; align-items:center;" title="Abrir referencia de autor"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
                    </div>
                </div>
                <div class="form-group-compact full-width">
                    <label class="form-label">Licencia</label>
                    <input type="text" class="form-control form-control-sm" data-field="license" value="${val(meta.license, '')}">
                </div>
                <div class="form-group-compact full-width">
                    <label class="form-label">Ruta completa del archivo</label>
                    <textarea class="form-control form-control-sm" data-field="fullPath" readonly style="opacity:0.9; font-family:monospace; font-size:0.75rem; background:rgba(0,0,0,0.2); border:1px solid var(--border-light); width:100%; min-height:40px; resize:none;">${val(meta.fullPath || meta._originalPath || meta.path || meta._path || meta.filename, '')}</textarea>
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
                            <option value="Dibujo" ${meta.type === 'Dibujo' ? 'selected' : ''}>Dibujo</option>
                            <option value="Fotografía" ${meta.type === 'Fotografía' ? 'selected' : ''}>Fotografía</option>
                            <option value="Grabado" ${meta.type === 'Grabado' ? 'selected' : ''}>Grabado</option>
                            <option value="Ilustración" ${meta.type === 'Ilustración' ? 'selected' : ''}>Ilustración</option>
                            <option value="Infografía 3D" ${meta.type === 'Infografía 3D' ? 'selected' : ''}>Infografía 3D</option>
                            <option value="Maqueta" ${meta.type === 'Maqueta' ? 'selected' : ''}>Maqueta</option>
                            <option value="Pintura" ${meta.type === 'Pintura' ? 'selected' : ''}>Pintura</option>
                            <option value="Plano" ${meta.type === 'Plano' ? 'selected' : ''}>Plano</option>
                            <option value="Recreación Visual" ${meta.type === 'Recreación Visual' ? 'selected' : ''}>Recreación Visual</option>
                            <option value="Texto" ${meta.type === 'Texto' ? 'selected' : ''}>Texto</option>
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
                } else if (field === 'tags') {
                    updates.tags = value.split(',').map(s => s.trim()).filter(Boolean);
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

            // Atajos de guardado rápido (Ctrl + G / Ctrl + S)
            input.addEventListener('keydown', (e) => {
                if (e.ctrlKey && (e.key.toLowerCase() === 'g' || e.key.toLowerCase() === 's')) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveHandler();
                    this.showToast('Cambios guardados', 'success');
                }
            });
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

    // --- PANEL DE EDICIÓN MÚLTIPLE ---
    renderMultiMetadataPanel(filenames) {
        if (!filenames || filenames.length === 0) return;

        // Limpiar el contenedor actual
        this.elements.metadataContent.innerHTML = '';

        const count = filenames.length;
        
        let html = `
            <div class="multi-select-header" style="background:#1a1a25; padding:15px; border-radius:8px; margin-bottom:15px; text-align:center; border:1px solid #00f2fe;">
                <h3 style="color:#00f2fe; margin-bottom:5px;">Edición en Lote</h3>
                <p style="color:#9ca3af; font-size:0.9rem;">${count} elementos seleccionados</p>
                <div style="font-size:0.8rem; margin-top:10px; color:#ff9a9e;">
                    Los valores introducidos a continuación sobreescribirán los existentes en TODOS los elementos seleccionados.
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Aplicar a Selección</div>
                
                <div class="form-group-compact">
                    <label class="form-label">Asunto Principal</label>
                    <input type="text" class="form-control form-control-sm multi-field" data-field="mainSubject" placeholder="Dejar en blanco para no modificar">
                </div>
                
                <div class="form-group-compact">
                    <label class="form-label">Autor</label>
                    <input type="text" class="form-control form-control-sm multi-field" data-field="author" placeholder="Dejar en blanco para no modificar">
                </div>

                <div class="form-group-compact">
                    <label class="form-label">Tipo de Documento</label>
                    <select class="form-control form-control-sm multi-field" data-field="type">
                        <option value="">-- No modificar --</option>
                        <option value="Dibujo">Dibujo</option>
                        <option value="Fotografía">Fotografía</option>
                        <option value="Grabado">Grabado</option>
                        <option value="Ilustración">Ilustración</option>
                        <option value="Infografía 3D">Infografía 3D</option>
                        <option value="Maqueta">Maqueta</option>
                        <option value="Pintura">Pintura</option>
                        <option value="Plano">Plano</option>
                        <option value="Recreación Visual">Recreación Visual</option>
                        <option value="Texto">Texto</option>
                    </select>
                </div>

                <div class="form-group-compact">
                    <label class="form-label">Estado Conservación</label>
                    <select class="form-control form-control-sm multi-field" data-field="conservationStatus">
                        <option value="">-- No modificar --</option>
                        <option value="Sin clasificar">Sin clasificar</option>
                        <option value="Desaparecido">Desaparecido</option>
                        <option value="En ruinas">En ruinas</option>
                        <option value="Modificado">Modificado</option>
                        <option value="Conservado">Conservado</option>
                    </select>
                </div>

                <div class="form-group-compact full-width">
                    <label class="form-label">Siglos (Reemplazar, separados por coma)</label>
                    <input type="text" class="form-control form-control-sm multi-field" data-field="centuries" placeholder="EJ: XIX, XX (Dejar en blanco para no modificar)">
                </div>
                
                <button id="btnApplyMulti" class="btn" style="width:100%; margin-top:15px; justify-content:center; background:#00f2fe; color:#000; font-weight:bold;">
                    Aplicar Cambios (${count})
                </button>
            </div>
        `;

        this.elements.metadataContent.innerHTML = html;

        // Lógica de guardado en lote
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

                if (confirm(`¿Aplicar estos cambios a los ${count} elementos seleccionados? Esta acción no se puede deshacer.`)) {
                    // Propagamos los cambios uno a uno sin llamar a onMetadataUpdate local 
                    // para evitar refrescos excesivos (Toast spam). Pasamos la actualización al padre por evento masivo.
                    
                    // Trigger manual loop
                    filenames.forEach(f => {
                        this.metadataManager.updateMetadata(f, updates);
                        this.updateGalleryItem(f); // Refresco visual ligero del ítem
                    });
                    
                    // Limpiamos los campos visualmente
                    inputs.forEach(input => input.value = '');
                    this.showToast(`Lote actualizado: ${count} elementos modificados`, 'success');
                    
                    // Forzamos al app.js a recargar filtros y marcadores si es necesario.
                    // Para esto creamos un CustomEvent o podemos reusar updateMetadata 
                    // notificando "lote" pero es más limpio despachar esto.
                    window.dispatchEvent(new CustomEvent('metadataBatchUpdated', { detail: { files: filenames, updates } }));
                }
            };
        }
    }
}
