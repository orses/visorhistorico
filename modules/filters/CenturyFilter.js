/**
 * CenturyFilter
 * Handles rendering and logic for century-based filtering.
 */
import BaseFilter from './BaseFilter.js';

export default class CenturyFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'centuryFilters');
        this.activeCenturies = new Set();
    }

    /**
     * Convierte un número romano a entero (para ordenación).
     */
    static romanToInt(s) {
        const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let res = 0;
        for (let i = 0; i < s.length; i++) {
            const v1 = map[s[i]], v2 = map[s[i + 1]];
            if (v2 > v1) res -= v1; else res += v1;
        }
        return res;
    }

    countByCentury(century) {
        return this.currentImages.filter(filename => {
            const meta = this.metadataManager.getMetadata(filename);
            const centuries = meta.centuries || [];
            if (century === 'UNKNOWN') return centuries.length === 0;
            return centuries.includes(century);
        }).length;
    }

    render() {
        if (!this.container) return;

        let centuries = this.metadataManager.getCenturies();
        centuries.sort((a, b) => CenturyFilter.romanToInt(a) - CenturyFilter.romanToInt(b));

        const chips = centuries.map(c => ({ value: c, label: c }));
        chips.push({ value: 'UNKNOWN', label: 'Sin Siglo' });

        this.container.innerHTML = this.renderSection('SIGLO', 'century', chips, 'century', {
            countFn: v => this.countByCentury(v)
        });

        const updateState = () => {
            this.activeCenturies = this.collectActiveValues('century');
            this.updateBulkButtonStates('century', this.activeCenturies, 'century');
        };

        this.attachChipListeners('century', updateState);
        this.attachBulkListeners('century', 'century', updateState);
        updateState();
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        const metaCenturies = meta.centuries || [];

        if (metaCenturies.length > 0) {
            return metaCenturies.some(c => this.activeCenturies.has(c));
        } else {
            return this.activeCenturies.has('UNKNOWN');
        }
    }
}
