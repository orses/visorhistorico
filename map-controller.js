// ===== CONTROLADOR DE MAPA =====

export default class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = {};
        this.markerLayer = null; // This will now be the ClusterGroup
        this.geoFilterLayer = null;
        this.baseLayers = {};
        this.init();
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

        this.baseLayers = {
            "Mapa": osm,
            "Satélite": satellite
        };

        // 2. Crear mapa centrado en Madrid con Mapa por defecto
        this.map = L.map(this.containerId, {
            center: [40.4168, -3.7038],
            zoom: 13,
            layers: [osm] // Por defecto mapa convencional
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
                console.log(`Snapped to nearby marker!`);
            }

            if (this.onMarkerDrag) {
                this.onMarkerDrag(filename, newPos);
            }
        });

        // Evento de click
        marker.on('click', () => {
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
            <div class="map-popup-container" style="width: 220px; font-family: 'Inter', sans-serif;">
                <img src="${imgPath}" class="popup-image" 
                     data-filename="${filename.replace(/"/g, '&quot;')}" 
                     style="cursor: zoom-in; transition: transform 0.2s;"
                     onerror="this.style.display='none'">
                <div class="popup-title">
                    <span class="status-dot ${statusClass}" title="${metadata.conservationStatus || 'Sin clasificar'}" style="width:6px; height:6px; margin-right:4px;"></span>
                    ${metadata.mainSubject || 'Sin título'}
                </div>
                ${metadata.location ? `<div style="font-size: 0.85rem; margin: 0.25rem 0; color: #ccc;">${metadata.location}</div>` : ''}
                <div class="popup-date" style="font-size: 0.8rem; opacity: 0.7;">${dateStr}${metadata.centuries.length > 0 ? ' • ' + metadata.centuries.join(', ') : ''}</div>
                ${metadata.author ? `<div style="font-size: 0.8rem; color: var(--accent-secondary); margin-top: 0.25rem; font-weight: 500;">${metadata.author}</div>` : ''}
            </div>
        `;
    }

    // Actualizar todos los marcadores
    updateMarkers(metadataCollection) {
        this.clearMarkers();

        Object.entries(metadataCollection).forEach(([filename, metadata]) => {
            // Solo agregar si tiene coordenadas
            if (metadata.coordinates) {
                this.addMarker(filename, metadata);
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
            this.map.panTo(marker.getLatLng());
            marker.openPopup();
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
