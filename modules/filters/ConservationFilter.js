/**
 * ConservationFilter
 * Handles rendering and logic for conservation status filtering.
 */
export default class ConservationFilter {
    constructor(metadataManager, onFilterChange) {
        this.metadataManager = metadataManager;
        this.onFilterChange = onFilterChange;
        this.container = document.getElementById('conservationFilters');
        this.activeStatuses = new Set();
        this.activeLocations = new Set();

        // Hardcoded due to context
        this.CONSERVATION_STATUSES = ['Desaparecido', 'En ruinas', 'Modificado', 'Conservado', 'Sin clasificar'];
    }

    render() {
        if (!this.container) return;

        let html = `
            <!-- FILTRO DE CONSERVACIÓN -->
            <div style="display:flex; gap:8px; margin-top:12px; margin-bottom:2px; align-items:center; padding-left:2px;">
                 <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; min-width:fit-content;">ESTADO:</span>
                 <button id="btnStatusAll" style="background:none; border:none; color:var(--accent-primary); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">TODOS</button>
                 <button id="btnStatusNone" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">NINGUNO</button>
                 <div style="height:1px; background:var(--border-color); flex:1;"></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
        `;

        html += this.CONSERVATION_STATUSES.map(c => `<div class="chip active" data-status="${c}">${c}</div>`).join('');
        html += this.CONSERVATION_STATUSES.map(c => `<div class="chip active" data-status="${c}">${c}</div>`).join('');
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

        // Listeners for controls
        document.getElementById('btnStatusAll').addEventListener('click', () => {
            this.container.querySelectorAll('.chip[data-status]').forEach(c => c.classList.add('active'));
            this.updateState();
            this.onFilterChange();
        });

        document.getElementById('btnStatusNone').addEventListener('click', () => {
            this.container.querySelectorAll('.chip[data-status]').forEach(c => c.classList.remove('active'));
            this.updateState();
            this.onFilterChange();
        });

        document.getElementById('btnCoordsAll')?.addEventListener('click', () => {
            this.container.querySelectorAll('.chip[data-location]').forEach(c => c.classList.add('active'));
            this.updateState();
            this.onFilterChange();
        });

        this.updateState();
    }

    updateState() {
        this.activeStatuses = new Set(Array.from(this.container.querySelectorAll('.chip.active[data-status]')).map(c => c.dataset.status));
        this.activeLocations = new Set(Array.from(this.container.querySelectorAll('.chip.active[data-location]')).map(c => c.dataset.location));
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);

        // Conservation status check
        const status = meta.conservationStatus || 'Sin clasificar';
        const statusMatch = this.activeStatuses.has(status);
        if (!statusMatch) return false;

        return true;
    }
}
