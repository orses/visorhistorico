/**
 * CenturyFilter
 * Handles rendering and logic for century-based filtering.
 */
export default class CenturyFilter {
    constructor(metadataManager, onFilterChange) {
        this.metadataManager = metadataManager;
        this.onFilterChange = onFilterChange;
        this.container = document.getElementById('centuryFilters');
        this.activeCenturies = new Set();
    }

    render() {
        if (!this.container) return;

        let centuries = this.metadataManager.getCenturies();

        // Helper for Roman sorting
        const romanToInt = (s) => {
            const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
            let res = 0;
            for (let i = 0; i < s.length; i++) {
                let v1 = map[s[i]], v2 = map[s[i + 1]];
                if (v2 > v1) res -= v1; else res += v1;
            }
            return res;
        };

        centuries.sort((a, b) => romanToInt(a) - romanToInt(b));

        let html = `
            <!-- FILTRO DE SIGLOS -->
            <!-- FILTRO DE SIGLOS -->
            <div style="display:flex; gap:8px; margin-bottom:4px; align-items:center; padding-left:2px;">
                 <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; min-width:fit-content;">SIGLO:</span>
                 <button id="btnFilterAll" style="background:none; border:none; color:var(--accent-primary); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0; white-space:nowrap;">TODOS</button>
                 <button id="btnFilterNone" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0; white-space:nowrap;">NINGUNO</button>
                 <div style="height:1px; background:var(--border-color); flex:1;"></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
        `;

        html += centuries.map(c => `<div class="chip active" data-century="${c}">${c}</div>`).join('');
        html += `<div class="chip active" data-century="UNKNOWN">Sin Siglo</div>`;
        html += `</div>`;

        this.container.innerHTML = html;

        // Listeners for chips
        this.container.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                this.updateState();
                this.onFilterChange();
            });
        });

        // Listeners for bulk controls
        document.getElementById('btnFilterAll').addEventListener('click', () => {
            this.container.querySelectorAll('.chip').forEach(c => c.classList.add('active'));
            this.updateState();
            this.onFilterChange();
        });

        document.getElementById('btnFilterNone').addEventListener('click', () => {
            this.container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            this.updateState();
            this.onFilterChange();
        });

        // Initialize state
        this.updateState();
    }

    updateState() {
        this.activeCenturies = new Set(Array.from(this.container.querySelectorAll('.chip.active')).map(c => c.dataset.century));
    }

    /**
     * Checks if a file matches the current century filter.
     * @param {string} filename 
     * @returns {boolean}
     */
    matches(filename) {
        // If all are selected (default), optimization could check if size equals total, but for now logic is kept identical
        const meta = this.metadataManager.getMetadata(filename);
        const metaCenturies = meta.centuries || [];
        const hasCentury = metaCenturies.length > 0;

        if (hasCentury) {
            return metaCenturies.some(c => this.activeCenturies.has(c));
        } else {
            return this.activeCenturies.has('UNKNOWN');
        }
    }
}
