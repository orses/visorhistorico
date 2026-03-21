/**
 * PositioningFilter.js
 * Filters images based on whether they have geolocation coordinates.
 */
import BaseFilter from './BaseFilter.js';

export default class PositioningFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'positioningFilters');
        this.activeStates = new Set(['without_coords', 'with_coords']);
    }

    countByPositioning(value) {
        return this.currentImages.filter(filename => {
            const meta = this.metadataManager.getMetadata(filename);
            const hasCoords = (meta.coordinates && typeof meta.coordinates.lat === 'number' && meta._userCoords === true);
            if (value === 'with_coords') return hasCoords;
            return !hasCoords;
        }).length;
    }

    render() {
        if (!this.container) return;

        const chips = [
            { value: 'without_coords', label: 'Sin Coordenadas' },
            { value: 'with_coords', label: 'Con Coordenadas' }
        ];

        this.container.innerHTML = this.renderSection('POSICIONAMIENTO', 'val', chips, 'val', {
            activeSet: this.activeStates,
            allLabel: 'TODAS',
            countFn: v => this.countByPositioning(v)
        });

        const updateState = () => {
            this.activeStates = this.collectActiveValues('val');
            this.updateBulkButtonStates('val', this.activeStates, 'val');
        };

        this.attachChipListeners('val', updateState);
        this.attachBulkListeners('val', 'val', updateState);
        updateState();
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        if (!meta) return false;

        const hasCoords = (meta.coordinates && typeof meta.coordinates.lat === 'number');

        if (hasCoords) {
            return this.activeStates.has('with_coords');
        } else {
            return this.activeStates.has('without_coords');
        }
    }
}
