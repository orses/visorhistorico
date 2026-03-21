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
        this.centuryFilter = new CenturyFilter(metadataManager, () => this.applyFilters(null));
        this.conservationFilter = new ConservationFilter(metadataManager, () => this.applyFilters(null));
        this.typeFilter = new TypeFilter(metadataManager, () => this.applyFilters(null));
        this.positioningFilter = new PositioningFilter(metadataManager, () => this.applyFilters(null));
        this.geographicFilter = new GeographicFilter(metadataManager, () => this.applyFilters(null));

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

        // 2. Apply Modules — bucle único que clasifica en galería y mapa
        const galleryFiltered = [];
        const mapFiltered = [];

        for (let i = 0; i < candidates.length; i++) {
            const filename = candidates[i];
            // Filtros comunes (compartidos por galería y mapa)
            if (!this.centuryFilter.matches(filename)) continue;
            if (!this.typeFilter.matches(filename)) continue;
            if (!this.conservationFilter.matches(filename)) continue;
            if (!this.geographicFilter.matches(filename)) continue;

            // Mapa: requiere coordenadas válidas (ignora positioningFilter)
            const meta = this.metadataManager.getMetadata(filename);
            if (meta.coordinates && meta.coordinates.lat) {
                mapFiltered.push(filename);
            }

            // Galería: también aplica el filtro de posicionamiento
            if (this.positioningFilter.matches(filename)) {
                galleryFiltered.push(filename);
            }
        }

        // Refrescar controladores si se solicita (para actualizar contadores)
        if (forceRefresh) {
            this.renderControllers();
        }

        // 4. Notify App
        this.onFilterUpdate(galleryFiltered, mapFiltered);

        // 5. Actualizar indicador visual del botón de filtros
        this.updateFilterIndicator();
    }

    /**
     * Comprueba si algún filtro tiene chips desactivados (filtrado activo).
     */
    hasActiveFilters() {
        const filters = [
            this.typeFilter,
            this.centuryFilter,
            this.conservationFilter,
            this.positioningFilter
        ];

        for (const filter of filters) {
            if (!filter.container) continue;
            const allChips = filter.container.querySelectorAll('.chip');
            const activeChips = filter.container.querySelectorAll('.chip.active');
            if (allChips.length > 0 && activeChips.length < allChips.length) {
                return true;
            }
        }

        // También considerar búsqueda textual como filtro activo
        if (this.lastQuery && this.lastQuery.trim() !== '') return true;

        return false;
    }

    /**
     * Actualiza la clase CSS del botón del embudo según si hay filtros activos.
     */
    updateFilterIndicator() {
        const btn = document.getElementById('toggleFiltersBtn');
        if (!btn) return;
        btn.classList.toggle('filters-applied', this.hasActiveFilters());
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
