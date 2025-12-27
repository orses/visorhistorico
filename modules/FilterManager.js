/**
 * FilterManager
 * Orchestrates all filter modules.
 */
import CenturyFilter from './filters/CenturyFilter.js';
import ConservationFilter from './filters/ConservationFilter.js';
import TypeFilter from './filters/TypeFilter.js';
import PositioningFilter from './filters/PositioningFilter.js';

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

        this.currentImages = []; // All available images
    }

    setImages(images) {
        this.currentImages = images;
        this.typeFilter.setImages(images);
        this.positioningFilter.setImages(images); // Good practice
    }

    renderControllers() {
        this.typeFilter.render();
        this.centuryFilter.render();
        this.conservationFilter.render();
        this.positioningFilter.render(); // Ensure listener is attached
    }

    applyFilters(searchQuery = '') {
        // 1. Text Search (using SearchEngine)
        // Note: Ideally SearchEngine should handle "partial" updates, but we'll re-run for now.
        // We'll store the last query to reuse it in external calls if needed, or pass it through.
        this.lastQuery = searchQuery;

        let candidates = searchQuery
            ? this.searchEngine.search(searchQuery).map(r => r.filename)
            : [...this.currentImages];

        // 2. Apply Modules
        const galleryFiltered = candidates.filter(filename => {
            if (!this.centuryFilter.matches(filename)) return false;
            if (!this.typeFilter.matches(filename)) return false;
            if (!this.conservationFilter.matches(filename)) return false;
            if (!this.positioningFilter.matches(filename)) return false;
            return true;
        });

        // 3. Map Data (ignores Positioning Filter "without_coords" case)
        const mapFiltered = candidates.filter(filename => {
            if (!this.centuryFilter.matches(filename)) return false;
            if (!this.typeFilter.matches(filename)) return false;
            if (!this.conservationFilter.matches(filename)) return false;

            // Map Logic: Always require connection to map (coords exist)
            // AND ignore the negative filter 'without_coords'
            const meta = this.metadataManager.getMetadata(filename);
            return (meta.coordinates && meta.coordinates.lat);
        });

        // 4. Notify App
        this.onFilterUpdate(galleryFiltered, mapFiltered);
    }
}
