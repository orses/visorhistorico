/**
 * FilterManager
 * Orchestrates all filter modules.
 */
import CenturyFilter from './filters/CenturyFilter.js';
import ConservationFilter from './filters/ConservationFilter.js';
import TypeFilter from './filters/TypeFilter.js';
import PositioningFilter from './filters/PositioningFilter.js';
import GeographicFilter from './filters/GeographicFilter.js';

export default class FilterManager {
    constructor(metadataManager, searchEngine, onFilterUpdate) {
        this.metadataManager = metadataManager;
        this.searchEngine = searchEngine;
        this.onFilterUpdate = onFilterUpdate;

        // Initialize individual filters
        this.centuryFilter = new CenturyFilter(metadataManager, () => this.applyFilters());
        this.conservationFilter = new ConservationFilter(metadataManager, () => this.applyFilters());
        this.typeFilter = new TypeFilter(metadataManager, () => this.applyFilters());
        this.positioningFilter = new PositioningFilter(metadataManager, () => this.applyFilters());
        this.geographicFilter = new GeographicFilter(metadataManager, () => this.applyFilters());

        this.currentImages = []; // All available images
    }

    setImages(images) {
        this.currentImages = images;
        this.typeFilter.setImages(images);
        this.centuryFilter.setImages(images);
        this.conservationFilter.setImages(images);
        this.positioningFilter.setImages(images);
        this.geographicFilter.setImages(images);
    }

    renderControllers() {
        this.typeFilter.render();
        this.centuryFilter.render();
        this.conservationFilter.render();
        this.positioningFilter.render(); // Ensure listener is attached
        this.geographicFilter.render();
    }

    applyFilters(searchQuery = '', forceRefresh = false) {
        // 1. Text Search (using SearchEngine)
        if (searchQuery !== null) this.lastQuery = searchQuery;
        const query = this.lastQuery || '';

        let candidates = query
            ? this.searchEngine.search(query).map(r => r.filename)
            : [...this.currentImages];

        // 2. Apply Modules
        const galleryFiltered = candidates.filter(filename => {
            if (!this.centuryFilter.matches(filename)) return false;
            if (!this.typeFilter.matches(filename)) return false;
            if (!this.conservationFilter.matches(filename)) return false;
            if (!this.positioningFilter.matches(filename)) return false;
            if (!this.geographicFilter.matches(filename)) return false;
            return true;
        });

        // Refrescar controladores si se solicita (para actualizar contadores)
        if (forceRefresh) {
            this.renderControllers();
        }

        // 3. Map Data (ignores Positioning Filter "without_coords" case)
        const mapFiltered = candidates.filter(filename => {
            if (!this.centuryFilter.matches(filename)) return false;
            if (!this.typeFilter.matches(filename)) return false;
            if (!this.conservationFilter.matches(filename)) return false;
            if (!this.geographicFilter.matches(filename)) return false;

            // Map Logic: Always require connection to map (coords exist)
            // AND ignore the negative filter 'without_coords'
            const meta = this.metadataManager.getMetadata(filename);
            return (meta.coordinates && meta.coordinates.lat);
        });

        // 4. Notify App
        this.onFilterUpdate(galleryFiltered, mapFiltered);
    }

    /**
     * Actualiza solo los contadores numéricos de los chips existentes sin
     * destruir el DOM ni perder el estado de selección de los filtros.
     */
    updateCounts() {
        // Actualizar contadores de tipo
        this._updateChipCounts(this.typeFilter, 'type', v => this.typeFilter.countByType(v));
        this._updateChipCounts(this.typeFilter, 'ext', v => this.typeFilter.countByExtension(v));
        // Actualizar contadores de siglo
        this._updateChipCounts(this.centuryFilter, 'century', v => this.centuryFilter.countByCentury(v));
        // Actualizar contadores de conservación
        this._updateChipCounts(this.conservationFilter, 'status', v => this.conservationFilter.countByStatus(v));
        // Actualizar contadores de posicionamiento
        this._updateChipCounts(this.positioningFilter, 'val', v => this.positioningFilter.countByPositioning(v));
    }

    /**
     * Helper: actualiza el texto de los .chip-count dentro de los chips de un filtro.
     */
    _updateChipCounts(filterInstance, dataAttr, countFn) {
        if (!filterInstance.container) return;
        filterInstance.container.querySelectorAll(`.chip[data-${dataAttr}]`).forEach(chip => {
            const value = chip.dataset[dataAttr];
            const countSpan = chip.querySelector('.chip-count');
            if (countSpan) {
                countSpan.textContent = countFn(value);
            }
        });
    }
}
