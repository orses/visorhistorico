// ===== CONTROLADOR DE MAPA =====
import logger from './modules/logger.js';

export default class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = {};
        this.markerLayer = null; // This will now be the ClusterGroup
        this.geoFilterLayer = null;
        this.notesLayer = null;
        this.mapNotes = [];
        this.baseLayers = {};
        this._markerHoverPreview = null;
        this._markerHoverTimeout = null;
        this._previewMarker = null;
        this.onNoteDelete = null;
        this.onNoteAdd = null;
        this.init();
    }

    _getMarkerHoverPreview() {
        if (!this._markerHoverPreview) {
            const container = document.getElementById(this.containerId);
            const el = document.createElement('div');
            el.className = 'marker-hover-preview';
            el.innerHTML = '<img alt="Vista previa"><div class="mhp-title"></div>';
            container.appendChild(el);
            this._markerHoverPreview = el;
        }
        return this._markerHoverPreview;
    }

    _showMarkerHoverPreview(marker, metadata) {
        clearTimeout(this._markerHoverTimeout);
        const el = this._getMarkerHoverPreview();
        const img = el.querySelector('img');
        const titleEl = el.querySelector('.mhp-title');

        img.src = metadata._previewUrl || '';
        titleEl.textContent = metadata.mainSubject || '';
        el.style.display = 'block';
        el.style.opacity = '0';

        const container = document.getElementById(this.containerId);
        const containerRect = container.getBoundingClientRect();
        const point = this.map.latLngToContainerPoint(marker.getLatLng());

        const previewW = 220;
        const previewH = 210;
        let left = point.x + 14;
        if (left + previewW > containerRect.width) left = point.x - previewW - 14;
        if (left < 0) left = 4;
        let top = point.y - previewH / 2;
        if (top < 0) top = 4;
        if (top + previewH > containerRect.height) top = containerRect.height - previewH - 4;

        el.style.left = left + 'px';
        el.style.top = top + 'px';
        requestAnimationFrame(() => { el.style.opacity = '1'; });
    }

    _hideMarkerHoverPreview() {
        if (!this._markerHoverPreview) return;
        this._markerHoverPreview.style.opacity = '0';
        this._markerHoverTimeout = setTimeout(() => {
            if (this._markerHoverPreview) this._markerHoverPreview.style.display = 'none';
        }, 150);
    }

    // Crea una instancia fresca de cualquier capa base (necesario para el modo comparación)
    _makeLayer(name, extraOptions = {}) {
        switch (name) {
            case 'Mapa':
                return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors', maxZoom: 19, ...extraOptions });
            case 'Satélite':
                return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles &copy; Esri', maxZoom: 19, ...extraOptions });
            case 'Topográfico':
                return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenTopoMap (CC-BY-SA)', maxNativeZoom: 17, maxZoom: 20, ...extraOptions });
            case 'Relieve ESRI':
                return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles &copy; Esri &mdash; Source: Esri', maxNativeZoom: 13, maxZoom: 20, ...extraOptions });
            case 'MTN IGN (España)':
                return L.tileLayer.wms('https://www.ign.es/wms-inspire/mapa-raster', {
                    layers: 'mtn_rasterizado', format: 'image/png', transparent: false,
                    version: '1.3.0', attribution: '&copy; IGN', maxZoom: 20, ...extraOptions });
            case 'Pedro Texeira (1656)':
                return L.tileLayer.wms('https://www.ign.es/wms/planos', {
                    layers: 'texeira', format: 'image/jpeg', transparent: false,
                    version: '1.3.0', attribution: '&copy; IGN', maxZoom: 20, ...extraOptions });
            default: return null;
        }
    }

    init() {
        // 1. Definir capas base (una instancia por capa para el selector normal)
        const osm      = this._makeLayer('Mapa');
        const satellite= this._makeLayer('Satélite');
        const topo     = this._makeLayer('Topográfico');
        const relief   = this._makeLayer('Relieve ESRI');   // ← puro sombreado de colinas, sin trama urbana
        const mtnIGN   = this._makeLayer('MTN IGN (España)');
        const texeira  = this._makeLayer('Pedro Texeira (1656)');

        this.baseLayers = {
            "Mapa":               osm,
            "Satélite":           satellite,
            "Topográfico":        topo,
            "Relieve ESRI":       relief,
            "MTN IGN (España)":   mtnIGN,
            "Pedro Texeira (1656)": texeira
        };

        // Overlay: sombreado de relieve IGN (transparente, combinable con cualquier base)
        const relieveIGN = L.tileLayer.wms('https://www.ign.es/wms-inspire/mdt', {
            layers: 'EL.GridCoverage', format: 'image/png', transparent: true,
            opacity: 0.45, version: '1.3.0', attribution: '&copy; IGN MDT', maxZoom: 20
        });

        const overlays = { "Relieve IGN": relieveIGN };

        // 2. Crear mapa
        this.map = L.map(this.containerId, {
            center: [40.4168, -3.7038],
            zoom: 13,
            layers: [osm],
            closePopupOnClick: true
        });

        // 3. Control de capas
        L.control.layers(this.baseLayers, overlays).addTo(this.map);

        // 4. Control de enlace a la fuente
        const sourceLinks = {
            "Mapa":               'https://www.openstreetmap.org',
            "Satélite":           'https://www.arcgis.com/apps/mapviewer',
            "Topográfico":        'https://opentopomap.org',
            "Relieve ESRI":       'https://www.arcgis.com/apps/mapviewer',
            "MTN IGN (España)":   'https://www.ign.es/iberpix/visor',
            "Pedro Texeira (1656)":'https://www.ign.es/web/catalogo-cartoteca/-/catalogo/MainForm'
        };

        const SourceLinkControl = L.Control.extend({
            options: { position: 'bottomleft' },
            onAdd() {
                const div = L.DomUtil.create('div', 'leaflet-source-link');
                div.style.cssText = 'background:rgba(255,255,255,0.85);padding:3px 7px;border-radius:4px;font-size:11px;line-height:1.4;';
                this._div = div;
                return div;
            },
            update(layerName) {
                const url = sourceLinks[layerName];
                this._div.innerHTML = url
                    ? `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0078a8;text-decoration:none;" title="Ver fuente del mapa">🔗 Ver fuente</a>`
                    : '';
            }
        });
        this._sourceLinkControl = new SourceLinkControl();
        this._sourceLinkControl.addTo(this.map);
        this._sourceLinkControl.update('Mapa');

        this.map.on('baselayerchange', (e) => {
            if (!this._compareActive) this._sourceLinkControl.update(e.name);
        });

        // 5. Control de comparación de mapas (slider)
        this._compareActive = false;
        this._comparePane   = null;
        this._compareRight  = null;
        this._compareSliderEl = null;

        const layerNames = Object.keys(this.baseLayers);
        const self = this;

        const CompareControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd(map) {
                const wrap = L.DomUtil.create('div', 'leaflet-compare-control leaflet-bar');
                wrap.style.cssText = 'background:#fff;padding:6px 8px;border-radius:4px;font-size:12px;min-width:200px;';
                wrap.innerHTML = `
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <select id="cmpLeft"  style="flex:1;font-size:11px;padding:2px;">${layerNames.map(n=>`<option>${n}</option>`).join('')}</select>
                        <span style="color:#666;">⟷</span>
                        <select id="cmpRight" style="flex:1;font-size:11px;padding:2px;">${layerNames.map((n,i)=>`<option ${i===1?'selected':''}>${n}</option>`).join('')}</select>
                        <button id="cmpBtn" style="font-size:11px;padding:2px 7px;cursor:pointer;border:1px solid #aaa;border-radius:3px;background:#f4f4f4;">Comparar</button>
                    </div>`;
                L.DomEvent.disableClickPropagation(wrap);
                L.DomEvent.disableScrollPropagation(wrap);

                wrap.querySelector('#cmpBtn').addEventListener('click', () => {
                    if (self._compareActive) {
                        self.stopCompare();
                        wrap.querySelector('#cmpBtn').textContent = 'Comparar';
                    } else {
                        const left  = wrap.querySelector('#cmpLeft').value;
                        const right = wrap.querySelector('#cmpRight').value;
                        self.startCompare(left, right);
                        wrap.querySelector('#cmpBtn').textContent = 'Salir';
                    }
                });
                return wrap;
            }
        });
        new CompareControl().addTo(this.map);

        // Capas para marcadores (Clustering)
        this.markerLayer = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        }).addTo(this.map);
        
        this.geoFilterLayer = L.layerGroup().addTo(this.map);

        this.notesLayer = L.featureGroup().addTo(this.map);
        this._notesMinZoom = 17;

        // Mostrar/ocultar notas según zoom
        const updateNotesVisibility = () => {
            const z = this.map.getZoom();
            const container = this.notesLayer.getPane ? null : null;
            this.notesLayer.eachLayer(l => {
                const el = l.getElement ? l.getElement() : null;
                if (el) el.style.visibility = z >= this._notesMinZoom ? '' : 'hidden';
            });
        };
        this.map.on('zoomend', updateNotesVisibility);
        this._updateNotesVisibility = updateNotesVisibility;

        // Ocultar hover preview si el mapa se mueve o hace zoom
        this.map.on('movestart zoomstart', () => this._hideMarkerHoverPreview());

        // Habilitar edición de coordenadas por drag
        this.map.on('click', (e) => {
            if (this.onMapClick) {
                this.onMapClick(e);
            }
        });

        // Delegated click for note delete buttons (inside Leaflet popups)
        document.getElementById(this.containerId).addEventListener('click', (e) => {
            if (e.target.classList.contains('note-delete-btn')) {
                const id = parseInt(e.target.dataset.id);
                if (this.onNoteDelete) this.onNoteDelete(id);
            }
        });
    }

    // Añadir marcador
    addMarker(filename, metadata) {
        if (!metadata.coordinates) return null;

        const { lat, lng } = metadata.coordinates;

        // Validar que lat y lng sean números válidos
        if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
            // console.warn(`Coordenadas inválidas para ${filename}:`, {lat, lng});
            return null;
        }

        // Crear icono personalizado por tipo
        const icon = this.createCustomIcon(metadata);

        // Crear marcador
        const marker = L.marker([lat, lng], {
            icon,
            draggable: true,
            title: metadata.mainSubject || filename
        });

        // Popup con preview
        const popupContent = this.createPopupContent(filename, metadata);
        marker.bindPopup(popupContent);

        // Evento de drag para actualizar coordenadas
        marker.on('dragend', (e) => {
            isDragging = false;
            let newPos = e.target.getLatLng();

            // Intentar snap a marcadores cercanos
            const nearby = this.findNearbyMarker(newPos, filename);
            if (nearby) {
                newPos = nearby;
                e.target.setLatLng(newPos);
                logger.log(`Snapped to nearby marker!`);
            }

            if (this.onMarkerDrag) {
                this.onMarkerDrag(filename, newPos);
            }
        });

        // Hover preview — flag para suprimir durante drag
        let isDragging = false;
        marker.on('mouseover', () => {
            if (!isDragging && metadata._previewUrl) this._showMarkerHoverPreview(marker, metadata);
        });
        marker.on('mouseout', () => {
            if (!isDragging) this._hideMarkerHoverPreview();
        });
        marker.on('dragstart', () => {
            isDragging = true;
            clearTimeout(this._markerHoverTimeout);
            if (this._markerHoverPreview) {
                this._markerHoverPreview.style.opacity = '0';
                this._markerHoverPreview.style.display = 'none';
            }
        });

        // Evento de click
        marker.on('click', () => {
            this._hideMarkerHoverPreview();
            if (this.onMarkerClick) {
                this.onMarkerClick(filename, metadata);
            }
        });

        marker.addTo(this.markerLayer);
        this.markers[filename] = marker;

        return marker;
    }

    // Crear icono personalizado
    createCustomIcon(metadata) {
        let color = '#d4af37'; // dorado por defecto

        // Color por siglo (Más antiguo = Más intenso/oscuro)
        if (metadata.centuries && metadata.centuries.length > 0) {
            const century = metadata.centuries[0];
            const centuryColors = {
                'X': '#2c0404', // Muy antiguo (Siglo 10) - Casi negro/rojo
                'XI': '#4a0808',
                'XII': '#690c0c',
                'XIII': '#800000', // Maroon
                'XIV': '#8B0000', // Dark Red
                'XV': '#B22222',  // Firebrick
                'XVI': '#FF0000', // Red
                'XVII': '#FF4500', // Orange Red
                'XVIII': '#FF8C00', // Dark Orange
                'XIX': '#FFD700', // Gold (Transition)
                'XX': '#4682B4',  // Steel Blue
                'XXI': '#00BFFF'  // Deep Sky Blue
            };
            color = centuryColors[century] || color;
        }

        const iconHtml = `
            <div class="marker-pin-wrapper">
                <div class="marker-pin" style="background-color: ${color};"></div>
            </div>
        `;

        return L.divIcon({
            html: iconHtml,
            className: 'custom-marker-container',
            iconSize: [20, 20],
            iconAnchor: [10, 20], // El anclaje ahora es la punta inferior
            popupAnchor: [0, -20]
        });
    }

    // Escapar HTML para prevenir XSS
    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Crear contenido del popup
    createPopupContent(filename, metadata) {
        // Usar previewUrl (blob) si existe, o construir ruta relativa codificada
        const imgPath = metadata._previewUrl || `../${encodeURIComponent(filename)}`;

        const dateStr = metadata.dateRange.start === metadata.dateRange.end ?
            metadata.dateRange.start :
            `${metadata.dateRange.start}-${metadata.dateRange.end}`;

        // Estado conservación
        const statusClass = metadata.conservationStatus ?
            'status-' + metadata.conservationStatus.toLowerCase().replace(/\s+/g, '-') :
            'status-sin-clasificar';

        return `
            <div class="map-popup-container">
                <div class="popup-image-wrapper">
                    <img src="${imgPath}" class="popup-image"
                         data-filename="${this._esc(filename)}"
                         title="Haz clic para ampliar"
                         onerror="this.style.display='none'">
                </div>
                <div class="popup-body">
                    <div class="popup-title">
                        <span class="status-dot ${statusClass}" title="${this._esc(metadata.conservationStatus || 'Sin clasificar')}"></span>
                        <span>${this._esc(metadata.mainSubject) || 'Sin título'}</span>
                    </div>
                    ${metadata.location ? `<div class="popup-location">${this._esc(metadata.location)}</div>` : ''}
                    <div class="popup-meta">
                        <span class="popup-date">${this._esc(dateStr)}</span>
                        ${metadata.centuries.length > 0 ? `<span class="popup-century">${this._esc(metadata.centuries.join(', '))}</span>` : ''}
                    </div>
                    ${metadata.author ? `<div class="popup-author"><span>Autor:</span> ${this._esc(metadata.author)}</div>` : ''}
                </div>
            </div>
        `;
    }

    // Actualizar todos los marcadores
    updateMarkers(metadataCollection) {
        const newFilenames = new Set(Object.keys(metadataCollection));
        const currentFilenames = Object.keys(this.markers);

        // 1. Eliminar marcadores que ya no están en la lista filtrada
        currentFilenames.forEach(f => {
            if (!newFilenames.has(f)) {
                this.markerLayer.removeLayer(this.markers[f]);
                delete this.markers[f];
            }
        });

        // 2. Añadir o actualizar los que sí están
        Object.entries(metadataCollection).forEach(([filename, metadata]) => {
            if (metadata.coordinates) {
                const marker = this.markers[filename];
                if (!marker) {
                    // No existía: añadir
                    this.addMarker(filename, metadata);
                } else {
                    // Ya existía: actualizar posición si ha cambiado (opcional, pero addOrUpdate ya lo hace)
                    // Por simplicidad y robustez, usamos addOrUpdateMarker que gestiona el reemplazo
                    this.addOrUpdateMarker(filename, metadata);
                }
            }
        });
    }

    // Añadir o actualizar un marcador individual (evita parpadeo total)
    addOrUpdateMarker(filename, metadata) {
        // Eliminar si ya existía
        if (this.markers[filename]) {
            this.markerLayer.removeLayer(this.markers[filename]);
            delete this.markers[filename];
        }
        // Añadir si tiene coordenadas
        if (metadata && metadata.coordinates) {
            this.addMarker(filename, metadata);
        }
    }

    // Limpiar todos los marcadores
    clearMarkers() {
        this.markerLayer.clearLayers();
        this.markers = {};
    }

    // Filtrar marcadores por criterio
    filterMarkers(filterFn) {
        Object.entries(this.markers).forEach(([filename, marker]) => {
            if (filterFn(filename)) {
                marker.addTo(this.markerLayer);
            } else {
                this.markerLayer.removeLayer(marker);
            }
        });
    }

    // Traer marcador al frente
    bringToFront(filename) {
        // Resetear z-index de todos
        Object.values(this.markers).forEach(m => m.setZIndexOffset(0));

        // Elevar el seleccionado
        const marker = this.markers[filename];
        if (marker) {
            marker.setZIndexOffset(1000);
        }
    }

    // Centrar en marcador sin cambiar el zoom
    focusMarker(filename) {
        this.bringToFront(filename);
        const marker = this.markers[filename];
        if (marker) {
            // Si usamos Marker Cluster, debemos asegurar que el marcador sea visible
            if (this.markerLayer && typeof this.markerLayer.zoomToShowLayer === 'function') {
                this.markerLayer.zoomToShowLayer(marker, () => {
                    // Una vez visible tras la animación del cluster, abrir popup
                    setTimeout(() => marker.openPopup(), 100);
                });
            } else {
                // Comportamiento estándar sin clusters
                this.map.panTo(marker.getLatLng());
                setTimeout(() => marker.openPopup(), 150);
            }
        }
    }

    // Ajustar vista a todos los marcadores
    fitBounds() {
        const group = L.featureGroup(Object.values(this.markers));
        if (group.getLayers().length > 0) {
            this.map.fitBounds(group.getBounds(), { padding: [50, 50] });
        }
    }

    // Obtener coordenadas del centro del mapa
    getCenter() {
        const center = this.map.getCenter();
        return { lat: center.lat, lng: center.lng };
    }

    // Obtener nivel de zoom actual
    getZoom() {
        return this.map.getZoom();
    }

    // Buscar marcador cercano para snap (2 metros)
    findNearbyMarker(latlng, excludeFilename) {
        const SNAP_THRESHOLD_METERS = 2.0;

        for (const [fname, marker] of Object.entries(this.markers)) {
            if (fname === excludeFilename) continue;

            const markerLatLng = marker.getLatLng();
            const distance = this.map.distance(latlng, markerLatLng);

            if (distance <= SNAP_THRESHOLD_METERS) {
                return markerLatLng;
            }
        }
        return null;
    }

    // --- GEOGRAPHIC FILTER DRAWING ---

    drawRadius(latlng, radius) {
        this.geoFilterLayer.clearLayers();
        if (!latlng) return;

        L.circle(latlng, {
            radius: radius,
            color: 'var(--accent-primary)',
            fillColor: 'var(--accent-primary)',
            fillOpacity: 0.1,
            weight: 2,
            dashArray: '5, 5'
        }).addTo(this.geoFilterLayer);
    }

    drawPolygon(coords) {
        this.geoFilterLayer.clearLayers();
        if (!coords || coords.length === 0) return;

        L.polygon(coords, {
            color: 'var(--accent-secondary)',
            fillColor: 'var(--accent-secondary)',
            fillOpacity: 0.2,
            weight: 2
        }).addTo(this.geoFilterLayer);
    }

    clearGeoFilter() {
        this.geoFilterLayer.clearLayers();
    }

    showPreviewMarker(lat, lng) {
        if (!this._previewMarker) {
            const icon = L.divIcon({
                className: 'preview-marker-container',
                html: '<div class="preview-marker-pin"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            this._previewMarker = L.marker([lat, lng], { icon, zIndexOffset: 2000, interactive: false });
        }
        this._previewMarker.setLatLng([lat, lng]);
        if (!this.map.hasLayer(this._previewMarker)) {
            this._previewMarker.addTo(this.map);
        }
    }

    hidePreviewMarker() {
        if (this._previewMarker && this.map.hasLayer(this._previewMarker)) {
            this.map.removeLayer(this._previewMarker);
        }
    }

    // --- MAP NOTES ---

    loadNotes(notes) {
        this.notesLayer.clearLayers();
        this.mapNotes = Array.isArray(notes) ? [...notes] : [];
        this.mapNotes.forEach(note => this._addNoteMarker(note));
    }

    addNote(lat, lng, text) {
        const note = { id: Date.now(), lat, lng, text };
        this.mapNotes.push(note);
        this._addNoteMarker(note);
        if (this.onNoteAdd) this.onNoteAdd(note);
        return note;
    }

    removeNote(id) {
        const idx = this.mapNotes.findIndex(n => n.id === id);
        if (idx !== -1) {
            this.mapNotes.splice(idx, 1);
        }
        this.notesLayer.eachLayer(layer => {
            if (layer._noteId === id) {
                this.notesLayer.removeLayer(layer);
            }
        });
    }

    _addNoteMarker(note) {
        const escaped = this._esc(note.text);
        const icon = L.divIcon({
            className: 'note-marker-container',
            html: `<div class="note-marker-label">${escaped}</div>`,
            iconSize: null,
            iconAnchor: [0, 0]
        });

        const marker = L.marker([note.lat, note.lng], { icon });
        marker._noteId = note.id;

        marker.bindPopup(`<button class="note-delete-btn" data-id="${note.id}">Eliminar nota</button>`);
        marker.addTo(this.notesLayer);

        // Aplicar visibilidad inicial según zoom actual
        if (this._updateNotesVisibility) this._updateNotesVisibility();
    }

    // ── COMPARACIÓN DE MAPAS CON SLIDER ─────────────────────────────────────

    startCompare(leftName, rightName) {
        this.stopCompare();

        // Cambiar capa base activa a la izquierda
        Object.values(this.baseLayers).forEach(l => { if (this.map.hasLayer(l)) this.map.removeLayer(l); });
        const leftLayer = this._makeLayer(leftName);
        leftLayer.addTo(this.map);

        // Crear pane exclusivo para la capa derecha (z-index por encima del tile pane normal)
        if (!this.map.getPane('comparePane')) this.map.createPane('comparePane');
        const pane = this.map.getPane('comparePane');
        pane.style.zIndex = 201;

        this._compareRight = this._makeLayer(rightName, { pane: 'comparePane' });
        this._compareRight.addTo(this.map);
        this._comparePane = pane;
        this._compareActive = true;

        // Posición inicial del slider: mitad del contenedor
        const mapEl = this.map.getContainer();
        let sliderX = mapEl.clientWidth / 2;

        // Aplicar clip-path al pane derecho (muestra solo desde sliderX hacia la derecha)
        const applyClip = () => {
            const w = mapEl.clientWidth;
            const h = mapEl.clientHeight;
            // inset(top right bottom left): recorta 'left' px por la izquierda
            pane.style.clipPath = `inset(0px 0px 0px ${sliderX}px)`;
        };
        applyClip();
        this.map.on('move zoom resize', applyClip);
        this._compareClipFn = applyClip;

        // Crear el div del slider
        const slider = document.createElement('div');
        slider.className = 'map-compare-slider';
        slider.style.cssText = `
            position:absolute; top:0; left:${sliderX}px; width:3px; height:100%;
            background:rgba(255,255,255,0.9); cursor:ew-resize; z-index:1000;
            box-shadow:0 0 6px rgba(0,0,0,0.4); touch-action:none;`;

        // Handle central visible
        const handle = document.createElement('div');
        handle.style.cssText = `
            position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
            width:28px; height:28px; background:#fff; border-radius:50%;
            box-shadow:0 1px 5px rgba(0,0,0,0.5);
            display:flex; align-items:center; justify-content:center;
            font-size:13px; color:#555; user-select:none;`;
        handle.textContent = '⇔';
        slider.appendChild(handle);
        mapEl.appendChild(slider);
        this._compareSliderEl = slider;

        // Arrastrar
        const onMove = (e) => {
            const rect = mapEl.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            sliderX = Math.max(0, Math.min(mapEl.clientWidth, clientX - rect.left));
            slider.style.left = sliderX + 'px';
            applyClip();
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend',  onUp);
        };
        slider.addEventListener('mousedown',  () => {
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup',   onUp);
        });
        slider.addEventListener('touchstart', () => {
            window.addEventListener('touchmove', onMove, { passive: true });
            window.addEventListener('touchend',  onUp);
        });
    }

    stopCompare() {
        if (!this._compareActive) return;
        this._compareActive = false;

        // Retirar capa derecha y limpiar pane
        if (this._compareRight) {
            this.map.removeLayer(this._compareRight);
            this._compareRight = null;
        }
        if (this._comparePane) {
            this._comparePane.style.clipPath = '';
            this._comparePane = null;
        }
        if (this._compareClipFn) {
            this.map.off('move zoom resize', this._compareClipFn);
            this._compareClipFn = null;
        }
        if (this._compareSliderEl) {
            this._compareSliderEl.remove();
            this._compareSliderEl = null;
        }

        // Restaurar capa base activa (la primera disponible)
        const firstBase = Object.values(this.baseLayers)[0];
        if (!this.map.hasLayer(firstBase)) firstBase.addTo(this.map);
    }

}
