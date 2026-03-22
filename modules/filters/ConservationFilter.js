/**
 * ConservationFilter
 */
import BaseFilter from './BaseFilter.js';

export default class ConservationFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'conservationFilters');
        this.activeStatuses = new Set();
        this.CONSERVATION_STATUSES = ['Desaparecido', 'En ruinas', 'Modificado', 'Conservado', 'Sin clasificar'];
        this._statusMap = {};
    }

    /** Reconstruye el mapa de conteo en O(n). */
    _buildCountMap() {
        this._statusMap = {};
        for (const filename of this.currentImages) {
            const meta = this.metadataManager.getMetadata(filename);
            const s = meta.conservationStatus || 'Sin clasificar';
            this._statusMap[s] = (this._statusMap[s] || 0) + 1;
        }
    }

    countByStatus(status) {
        return this._statusMap[status] || 0;
    }

    render() {
        if (!this.container) return;

        this._buildCountMap();

        const chips = this.CONSERVATION_STATUSES.map(s => ({ value: s, label: s }));

        this.container.innerHTML = this.renderSection('ESTADO', 'status', chips, 'status', {
            countFn: v => this.countByStatus(v)
        });

        const updateState = () => {
            this.activeStatuses = this.collectActiveValues('status');
            this.updateBulkButtonStates('status', this.activeStatuses, 'status');
        };

        this.attachChipListeners('status', updateState);
        this.attachBulkListeners('status', 'status', updateState);
        updateState();
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        return this.activeStatuses.has(meta.conservationStatus || 'Sin clasificar');
    }
}
