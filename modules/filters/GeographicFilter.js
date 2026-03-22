/**
 * GeographicFilter.js
 * Filters images based on spatial criteria (radius or polygons).
 */
import BaseFilter from './BaseFilter.js';

export default class GeographicFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'geographicFilters');

        this.activeMode = 'none'; // 'none', 'radius', 'polygon'
        this.filterCoords = null; // {lat, lng} for radius
        this.radiusMeters = 500;
        this.activePolygonName = null;

        // Barrios históricos predefinidos (coordenadas aproximadas para demo)
        this.districts = {
            'Letras': [
                [40.4144, -3.7001], [40.4158, -3.6985], [40.4136, -3.6938], [40.4121, -3.6953]
            ],
            'Austrias': [
                [40.4165, -3.7135], [40.4185, -3.7125], [40.4175, -3.7075], [40.4145, -3.7085]
            ]
        };
    }

    render() {
        if (!this.container) return;

        const bodyHtml = `
            <div class="filter-chips">
                <div class="chip ${this.activeMode === 'radius' ? 'active' : ''}" data-mode="radius">Radio (500m)</div>
                <div class="chip ${this.activeMode === 'polygon' ? 'active' : ''}" data-mode="polygon">Barrios</div>
            </div>
            ${this.activeMode === 'polygon' ? `
                <div class="filter-chips" style="margin-top:8px;">
                    ${Object.keys(this.districts).map(name => `
                        <div class="chip ${this.activePolygonName === name ? 'active' : ''}" data-district="${name}">${name}</div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        this.container.innerHTML = this.renderSection('GEOGRAFÍA', 'geo', [], null, {
            allLabel: '', // No aplicable aquí
            noneLabel: 'LIMPIAR'
        });

        // Reemplazar el contenedor de chips por el nuestro personalizado
        this.container.querySelector('.filter-chips-wrapper').innerHTML = bodyHtml;

        this.attachListeners();
        this.attachBulkListeners('geo', 'mode', null, () => {
             this.activeMode = 'none';
             this.filterCoords = null;
             this.activePolygonName = null;
        });
    }

    attachListeners() {
        // Los listeners específicos los mantenemos
        this.container.querySelectorAll('[data-mode]').forEach(chip => {
            chip.addEventListener('click', () => {
                const mode = chip.dataset.mode;
                this.activeMode = (this.activeMode === mode) ? 'none' : mode;
                this.render();
                this.onFilterChange();
            });
        });

        this.container.querySelectorAll('[data-district]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activePolygonName = btn.dataset.district;
                this.render();
                this.onFilterChange();
            });
        });
    }

    setActiveCoords(latlng) {
        this.filterCoords = latlng;
        if (this.activeMode === 'radius') {
            this.onFilterChange();
        }
    }

    reset() {
        this.activeMode = 'none';
        this.filterCoords = null;
        this.activePolygonName = null;
    }

    matches(filename) {
        if (this.activeMode === 'none') return true;

        const meta = this.metadataManager.getMetadata(filename);
        if (!meta.coordinates || !meta.coordinates.lat) return false;

        const mLat = meta.coordinates.lat;
        const mLng = meta.coordinates.lng;

        if (this.activeMode === 'radius') {
            if (!this.filterCoords) return true;
            const dist = this.getDistance(this.filterCoords.lat, this.filterCoords.lng, mLat, mLng);
            return dist <= this.radiusMeters;
        }

        if (this.activeMode === 'polygon') {
            if (!this.activePolygonName) return true;
            const poly = this.districts[this.activePolygonName];
            return this.isPointInPolygon([mLat, mLng], poly);
        }

        return true;
    }

    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const dPhi = (lat2 - lat1) * Math.PI / 180;
        const dLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    isPointInPolygon(point, vs) {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0], yi = vs[i][1];
            const xj = vs[j][0], yj = vs[j][1];
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}
