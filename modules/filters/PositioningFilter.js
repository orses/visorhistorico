/**
 * PositioningFilter
 */
import BaseFilter from './BaseFilter.js';

export default class PositioningFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'positioningFilters');
        this.activeStates = new Set(['without_coords', 'with_coords']);
        this._withCoords    = 0;
        this._withoutCoords = 0;
    }

    static _hasCoords(meta) {
        return !!(meta.coordinates && typeof meta.coordinates.lat === 'number');
    }

    /** Reconstruye los contadores en O(n). */
    _buildCountMap() {
        this._withCoords    = 0;
        this._withoutCoords = 0;
        for (const filename of this.currentImages) {
            const meta = this.metadataManager.getMetadata(filename);
            if (PositioningFilter._hasCoords(meta)) this._withCoords++;
            else this._withoutCoords++;
        }
    }

    countByPositioning(value) {
        return value === 'with_coords' ? this._withCoords : this._withoutCoords;
    }

    render() {
        if (!this.container) return;

        this._buildCountMap();

        const chips = [
            { value: 'without_coords', label: 'Sin Coordenadas' },
            { value: 'with_coords',    label: 'Con Coordenadas' }
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

    reset() {
        this.activeStates = new Set(['without_coords', 'with_coords']);
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        if (!meta) return false;
        return PositioningFilter._hasCoords(meta)
            ? this.activeStates.has('with_coords')
            : this.activeStates.has('without_coords');
    }
}
