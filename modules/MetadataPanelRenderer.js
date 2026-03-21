/**
 * MetadataPanelRenderer
 * Handles the details panel: single-image metadata form rendering and listeners.
 */
import { DOCUMENT_TYPES, CONSERVATION_STATUSES } from './constants.js';

export default class MetadataPanelRenderer {
    constructor(metadataManager, metadataContentEl) {
        this.metadataManager = metadataManager;
        this.metadataContentEl = metadataContentEl;
        this.onMetadataUpdate = null;
        this.onOpenOriginal = null;
        this._blurTimeout = null;
        this._prevValues = new Map();
        this._saveStatusTimeout = null;
    }

    renderMetadataPanel(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        if (!meta) return;

        const val = (v, fallback = '-') => (v !== null && v !== undefined && v !== '') ? v : fallback;

        const dateStart = meta.dateRange?.start || '';
        const dateEnd = meta.dateRange?.end || '';
        const coordLat = (meta.coordinates?.lat) ? meta.coordinates.lat.toFixed(6) : '';
        const coordLng = (meta.coordinates?.lng) ? meta.coordinates.lng.toFixed(6) : '';

        let statusClass = 'status-sin-clasificar';
        let statusTitle = 'Sin clasificar';
        if (meta.conservationStatus && meta.conservationStatus !== 'Sin clasificar') {
            statusClass = 'status-' + meta.conservationStatus.toLowerCase().replace(/\s+/g, '-');
            statusTitle = meta.conservationStatus;
        }

        const html = `
            <div id="saveStatus" class="save-status"></div>
            <div class="details-image-container" title="Clic para ampliar">
                <img id="detailsImage" src="${meta._previewUrl || filename}" alt="${meta.mainSubject || filename}"${meta.rotation ? ` style="transform:rotate(${meta.rotation}deg)"` : ''}>
            </div>

            <div class="meta-row-tech" role="group" aria-label="Información técnica">
                <div class="tech-item" title="Estado: ${statusTitle}">
                    <span class="status-dot ${statusClass}" aria-label="Estado de conservación: ${statusTitle}"></span>
                </div>
                <div class="tech-item" title="Peso del archivo">
                    <span>${this.formatFileSize(meta._fileSize) || '-'}</span>
                </div>
                <div class="tech-item" title="Dimensiones">
                    <span id="metaDim">-</span>
                </div>
                <div class="tech-item" title="DPI">
                    <span>-</span>
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Información Principal</div>
                <div class="form-group-compact">
                    <label class="form-label" for="field-mainSubject">Asunto Principal</label>
                    <input id="field-mainSubject" type="text" class="form-control form-control-sm" data-field="mainSubject" value="${val(meta.mainSubject, '')}">
                </div>
                <div class="form-group-compact">
                    <label class="form-label" for="field-author">Autor</label>
                    <input id="field-author" type="text" class="form-control form-control-sm" data-field="author" value="${val(meta.author, '')}">
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Cronología y Ubicación</div>
                <div class="details-grid">
                    <div class="form-group-compact">
                        <label class="form-label" for="field-dateStart">Año Inicio</label>
                        <input id="field-dateStart" type="number" class="form-control form-control-sm" data-field="dateRange.start" value="${dateStart}" aria-label="Año de inicio">
                    </div>
                    <div class="form-group-compact">
                        <label class="form-label" for="field-dateEnd">Año Fin</label>
                        <input id="field-dateEnd" type="number" class="form-control form-control-sm" data-field="dateRange.end" value="${dateEnd}" aria-label="Año de fin">
                    </div>
                    <div class="form-group-compact full-width">
                        <label class="form-label" for="field-centuries">Siglo (separados por coma)</label>
                        <input id="field-centuries" type="text" class="form-control form-control-sm" data-field="centuries" value="${(meta.centuries || []).join(', ')}">
                    </div>
                    <div class="form-group-compact full-width">
                        <label class="form-label" for="field-location">Ubicación</label>
                        <input id="field-location" type="text" class="form-control form-control-sm" data-field="location" value="${val(meta.location, '')}">
                    </div>
                    <div class="form-group-compact full-width">
                        <label class="form-label" for="field-reign">Reinado/Periodo</label>
                        <input id="field-reign" type="text" class="form-control form-control-sm" data-field="reign" value="${val(meta.reign, '')}">
                    </div>
                    <div class="form-group-compact full-width">
                        <label class="form-label" for="field-tags">Etiquetas (separadas por coma)</label>
                        <input id="field-tags" type="text" class="form-control form-control-sm" data-field="tags" value="${(meta.tags || []).join(', ')}">
                    </div>
                    <div class="form-group-compact">
                        <label class="form-label" for="field-lat">Latitud</label>
                        <input id="field-lat" type="number" step="any" class="form-control form-control-sm" data-field="coordinates.lat" value="${coordLat}" min="-90" max="90">
                    </div>
                    <div class="form-group-compact">
                        <label class="form-label" for="field-lng">Longitud</label>
                        <input id="field-lng" type="number" step="any" class="form-control form-control-sm" data-field="coordinates.lng" value="${coordLng}" min="-180" max="180">
                    </div>
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Referencias y Archivo</div>
                <div class="form-group-compact full-width">
                    <label class="form-label" for="field-sourceUrl">Enlace a la fuente</label>
                    <div class="source-url-row">
                        <input id="field-sourceUrl" type="text" class="form-control form-control-sm" data-field="sourceUrl" value="${val(meta.sourceUrl, '')}">
                        ${meta.sourceUrl ? `<a href="${meta.sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding:0 8px; display:flex; align-items:center;" title="Abrir fuente" aria-label="Abrir fuente en nueva pestaña"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
                    </div>
                </div>
                <div class="form-group-compact full-width">
                    <label class="form-label" for="field-authorUrl">Referencia del autor</label>
                    <div class="source-url-row">
                        <input id="field-authorUrl" type="text" class="form-control form-control-sm" data-field="authorUrl" value="${val(meta.authorUrl, '')}">
                        ${meta.authorUrl ? `<a href="${meta.authorUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding:0 8px; display:flex; align-items:center;" title="Abrir referencia de autor" aria-label="Abrir referencia de autor en nueva pestaña"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
                    </div>
                </div>
                <div class="form-group-compact full-width">
                    <label class="form-label" for="field-license">Licencia</label>
                    <input id="field-license" type="text" class="form-control form-control-sm" data-field="license" value="${val(meta.license, '')}">
                </div>
                <div class="form-group-compact full-width">
                    <label class="form-label" for="field-fullPath">Ruta completa del archivo</label>
                    <textarea id="field-fullPath" class="form-control form-control-sm form-control-filepath" data-field="fullPath" readonly aria-readonly="true">${val(meta.fullPath || meta._originalPath || meta.path || meta._path || meta.filename, '')}</textarea>
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Detalles Técnicos</div>
                <div class="details-grid">
                    <div class="form-group-compact">
                        <label class="form-label" for="field-conservation">Conservación</label>
                        <select id="field-conservation" class="form-control form-control-sm" data-field="conservationStatus">
                            ${CONSERVATION_STATUSES.map(s => `<option value="${s}" ${(meta.conservationStatus === s || (!meta.conservationStatus && s === 'Sin clasificar')) ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group-compact">
                        <label class="form-label" for="field-type">Tipo</label>
                        <select id="field-type" class="form-control form-control-sm" data-field="type">
                            <option value="" ${!meta.type ? 'selected' : ''}>-- Seleccionar --</option>
                            ${DOCUMENT_TYPES.map(t => `<option value="${t}" ${meta.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <div class="details-section">
                <div class="details-section-title">Notas</div>
                <label class="form-label visually-hidden" for="field-notes">Notas</label>
                <textarea id="field-notes" class="form-control form-control-sm" data-field="notes" rows="3" style="resize:vertical; font-size:0.8rem;">${val(meta.notes, '')}</textarea>
            </div>

            <div class="details-actions">
                <a href="${meta._previewUrl || filename}" download target="_blank" class="btn btn-secondary" aria-label="Descargar imagen">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Descargar
                </a>
                <a href="#" id="btnOpenOriginal" class="btn btn-secondary" aria-label="Ver imagen original en tamaño completo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    Ver Original
                </a>
            </div>
        `;

        this.metadataContentEl.innerHTML = html;

        const img = this.metadataContentEl.querySelector('#detailsImage');
        if (img) {
            img.onload = () => {
                const dimSpan = this.metadataContentEl.querySelector('#metaDim');
                if (dimSpan) dimSpan.textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
            };
            if (img.complete) {
                const dimSpan = this.metadataContentEl.querySelector('#metaDim');
                if (dimSpan) dimSpan.textContent = `${img.naturalWidth} x ${img.naturalHeight} px`;
            }
            img.onclick = () => { if (this.onOpenOriginal) this.onOpenOriginal(filename); };
            img.style.cursor = 'pointer';
        }

        const btnOpen = this.metadataContentEl.querySelector('#btnOpenOriginal');
        if (btnOpen) {
            btnOpen.onclick = (e) => {
                e.preventDefault();
                if (this.onOpenOriginal) this.onOpenOriginal(filename);
            };
        }

        this.attachMetadataListeners(filename);
    }

    _showSaveStatus(message) {
        const el = this.metadataContentEl.querySelector('#saveStatus');
        if (!el) return;
        if (this._saveStatusTimeout) clearTimeout(this._saveStatusTimeout);
        el.textContent = message;
        el.classList.add('visible');
        this._saveStatusTimeout = setTimeout(() => {
            el.classList.remove('visible');
        }, 2000);
    }

    attachMetadataListeners(filename) {
        const inputs = this.metadataContentEl.querySelectorAll('[data-field]');

        inputs.forEach(input => {
            const saveHandler = () => {
                const field = input.dataset.field;
                const value = input.value;
                const updates = {};

                // Store old value before saving
                const currentMeta = this.metadataManager.getMetadata(filename);
                let oldValue = '';
                if (field === 'dateRange.start') {
                    oldValue = currentMeta.dateRange?.start ?? '';
                    updates.dateRange = { ...currentMeta.dateRange, start: value ? parseInt(value) : null };
                } else if (field === 'dateRange.end') {
                    oldValue = currentMeta.dateRange?.end ?? '';
                    updates.dateRange = { ...currentMeta.dateRange, end: value ? parseInt(value) : null };
                } else if (field === 'coordinates.lat') {
                    oldValue = currentMeta.coordinates?.lat ?? '';
                    const lat = value ? parseFloat(value) : null;
                    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) return;
                    updates.coordinates = { ...currentMeta.coordinates, lat };
                } else if (field === 'coordinates.lng') {
                    oldValue = currentMeta.coordinates?.lng ?? '';
                    const lng = value ? parseFloat(value) : null;
                    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) return;
                    updates.coordinates = { ...currentMeta.coordinates, lng };
                } else if (field === 'centuries') {
                    oldValue = (currentMeta.centuries || []).join(', ');
                    updates.centuries = value.split(',').map(s => s.trim()).filter(Boolean);
                } else if (field === 'tags') {
                    oldValue = (currentMeta.tags || []).join(', ');
                    updates.tags = value.split(',').map(s => s.trim()).filter(Boolean);
                } else {
                    oldValue = currentMeta[field] ?? '';
                    updates[field] = value;
                }

                this._prevValues.set(field, String(oldValue));

                if (this.onMetadataUpdate) {
                    this.onMetadataUpdate(filename, updates);
                    this._showSaveStatus('\u2713 Guardado');
                }
            };

            const debouncedSave = () => {
                this._showSaveStatus('Guardando...');
                if (this._blurTimeout) clearTimeout(this._blurTimeout);
                this._blurTimeout = setTimeout(saveHandler, 300);
            };

            input.addEventListener('blur', debouncedSave);
            if (input.tagName === 'SELECT') {
                input.addEventListener('change', saveHandler);
            }
            input.addEventListener('keydown', (e) => {
                if (e.ctrlKey && (e.key.toLowerCase() === 'g' || e.key.toLowerCase() === 's')) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveHandler();
                }
                // Ctrl+Z: Undo last change for this field
                if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                    const field = input.dataset.field;
                    if (this._prevValues.has(field)) {
                        e.preventDefault();
                        e.stopPropagation();
                        const prevVal = this._prevValues.get(field);
                        input.value = prevVal;
                        // Build updates from restored value
                        const updates = {};
                        const currentMeta = this.metadataManager.getMetadata(filename);
                        if (field === 'dateRange.start') {
                            updates.dateRange = { ...currentMeta.dateRange, start: prevVal ? parseInt(prevVal) : null };
                        } else if (field === 'dateRange.end') {
                            updates.dateRange = { ...currentMeta.dateRange, end: prevVal ? parseInt(prevVal) : null };
                        } else if (field === 'coordinates.lat') {
                            updates.coordinates = { ...currentMeta.coordinates, lat: prevVal ? parseFloat(prevVal) : null };
                        } else if (field === 'coordinates.lng') {
                            updates.coordinates = { ...currentMeta.coordinates, lng: prevVal ? parseFloat(prevVal) : null };
                        } else if (field === 'centuries') {
                            updates.centuries = prevVal ? prevVal.split(',').map(s => s.trim()).filter(Boolean) : [];
                        } else if (field === 'tags') {
                            updates.tags = prevVal ? prevVal.split(',').map(s => s.trim()).filter(Boolean) : [];
                        } else {
                            updates[field] = prevVal;
                        }
                        this._prevValues.delete(field);
                        if (this.onMetadataUpdate) {
                            this.onMetadataUpdate(filename, updates);
                            this._showSaveStatus('\u21A9 Deshecho');
                        }
                    }
                }
            });
        });
    }

    formatFileSize(bytes) {
        if (!bytes) return 'N/D';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KiB';
        return (bytes / 1048576).toFixed(1) + ' MiB';
    }
}
