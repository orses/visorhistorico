/**
 * ConservationFilter
 * Handles rendering and logic for conservation status filtering.
 */
import BaseFilter from './BaseFilter.js';

export default class ConservationFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'conservationFilters');
        this.activeStatuses = new Set();
        this.CONSERVATION_STATUSES = ['Desaparecido', 'En ruinas', 'Modificado', 'Conservado', 'Sin clasificar'];
    }

    countByStatus(status) {
        return this.currentImages.filter(filename => {
            const meta = this.metadataManager.getMetadata(filename);
            return (meta.conservationStatus || 'Sin clasificar') === status;
        }).length;
    }

    render() {
        if (!this.container) return;

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
        const status = meta.conservationStatus || 'Sin clasificar';
        return this.activeStatuses.has(status);
    }
}
