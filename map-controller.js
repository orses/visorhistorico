// ===== CONTROLADOR DE MAPA =====
import logger from './modules/logger.js';

export default class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = {};
        this.markerLayer = null; // This will now be the ClusterGroup
        this.geoFilterLayer = null;
        this.baseLayers = {};
        this._markerHoverPreview = null;
        this._markerHoverTimeout = null;
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

    init() {
        // 1. Definir capas base
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        });

        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19
        });

        const texeira = L.tileLayer.wms('https://www.ign.es/wms/planos', {
            layers: 'texeira',
            format: 'image/jpeg',
            transparent: false,
            version: '1.3.0',
            attribution: '&copy; Instituto Geográfico Nacional',
            maxZoom: 20
        });

        this.baseLayers = {
            "Mapa": osm,
            "Satélite": satellite,
            "Pedro Texeira (1656)": texeira
        };

        // 2. Crear mapa centrado en Madrid con Mapa por defecto
        this.map = L.map(this.containerId, {
            center: [40.4168, -3.7038],
            zoom: 13,
            layers: [osm], // Por defecto mapa convencional
            closePopupOnClick: false // No cerrar popups al pinchar fuera (ej. en galería)
        });

        // 3. Añadir control de selección de capas
        L.control.layers(this.baseLayers).addTo(this.map);

        // Capas para marcadores (Clustering)
        this.markerLayer = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        }).addTo(this.map);
        
        this.geoFilterLayer = L.layerGroup().addTo(this.map);

        // Habilitar edición de coordenadas por drag
        this.map.on('click', (e) => {
            if (this.onMapClick) {
                this.onMapClick(e);
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

        // Hover preview
        marker.on('mouseover', () => {
            if (metadata._previewUrl) this._showMarkerHoverPreview(marker, metadata);
        });
        marker.on('mouseout', () => this._hideMarkerHoverPreview());

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

}
