/**
 * FilterManager
 * Orchestrates all filter modules.
 */
import CenturyFilter from './filters/CenturyFilter.js';
import ConservationFilter from './filters/ConservationFilter.js';
import TypeFilter from './filters/TypeFilter.js';
import PositioningFilter from './filters/PositioningFilter.js';
import GeographicFilter from './filters/GeographicFilter.js';
import TimelineFilter from './filters/TimelineFilter.js';

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
        this.timelineFilter = new TimelineFilter(metadataManager, () => this.applyFilters(null));

        this.currentImages = []; // All available images
    }

    setImages(images) {
        this.currentImages = images;
        this.typeFilter.setImages(images);
        this.centuryFilter.setImages(images);
        this.conservationFilter.setImages(images);
        this.positioningFilter.setImages(images);
        this.geographicFilter.setImages(images);
        this.timelineFilter.setImages(images);
    }

    renderControllers() {
        this.typeFilter.render();
        this.centuryFilter.render();
        this.conservationFilter.render();
        this.positioningFilter.render(); // Ensure listener is attached
        this.geographicFilter.render();
        this.timelineFilter.render();
    }

    async applyFilters(searchQuery = '', forceRefresh = false) {
        // 1. Text Search (using SearchEngine or SearchWorkerClient)
        if (searchQuery !== null) this.lastQuery = searchQuery;
        const query = this.lastQuery || '';

        let candidates;
        if (query) {
            if (this.searchWorkerClient) {
                const results = await this.searchWorkerClient.search(query);
                candidates = results.map(r => r.filename);
            } else {
                candidates = this.searchEngine.search(query).map(r => r.filename);
            }
        } else {
            candidates = [...this.currentImages];
        }

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
            if (!this.timelineFilter.matches(filename)) continue;

            // Mapa: requiere coordenadas válidas (ignora positioningFilter)
            const meta = this.metadataManager.getMetadata(filename);
            if (meta.coordinates && meta.coordinates.lat && meta._userCoords === true) {
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

        // Timeline filter
        if (this.timelineFilter.hasActiveFilter()) return true;

        return false;
    }

    /**
     * Resetea todos los filtros y la búsqueda textual al estado inicial (todo activo).
     */
    resetAll() {
        this.lastQuery = '';
        this.timelineFilter.reset();
        this.renderControllers(); // re-renderiza chips con todos activos
        this.applyFilters('');
    }

    /**
     * Actualiza la clase CSS del botón del embudo y la visibilidad del botón de limpiar filtros.
     */
    updateFilterIndicator() {
        const active = this.hasActiveFilters();
        const btn = document.getElementById('toggleFiltersBtn');
        if (btn) btn.classList.toggle('filters-applied', active);
        const clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) clearBtn.classList.toggle('hidden', !active);
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
