/**
 * PositioningFilter.js
 * Filters images based on whether they have geolocation coordinates.
 */
export default class PositioningFilter {
    constructor(metadataManager, onFilterChange) {
        this.metadataManager = metadataManager;
        this.onFilterChange = onFilterChange;
        // Default: Both active (Set-based to allow toggling individually)
        this.activeStates = new Set(['without_coords', 'with_coords']);
    }

    setImages(images) {
        // Not needed for simple check, but good for interface consistency
    }

    render() {
        const container = document.getElementById('positioningFilters');
        if (!container) return;

        // Verify if already rendered to avoid duplicates
        if (container.querySelector('.positioning-controls')) return;

        const html = `
             <div class="positioning-controls" style="display:flex; gap:8px; margin-top:12px; margin-bottom:2px; align-items:center; padding-left:2px;">
                 <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; min-width:fit-content;">POSICIONAMIENTO:</span>
                 <button id="btnPosAll" style="background:none; border:none; color:var(--accent-primary); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">TODAS</button>
                 <button id="btnPosNone" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">NINGUNO</button>
                 <div style="height:1px; background:var(--border-color); flex:1;"></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                 <div class="chip ${this.activeStates.has('without_coords') ? 'active' : ''}" data-val="without_coords">Sin Coordenadas</div>
                 <div class="chip ${this.activeStates.has('with_coords') ? 'active' : ''}" data-val="with_coords">Con Coordenadas</div>
            </div>
        `;

        container.innerHTML = html;

        const updateButtonStates = () => {
            const btnAll = container.querySelector('#btnPosAll');
            const btnNone = container.querySelector('#btnPosNone');
            if (!btnAll || !btnNone) return;

            const allSelected = this.activeStates.has('without_coords') && this.activeStates.has('with_coords');
            const noneSelected = this.activeStates.size === 0;

            if (allSelected) {
                btnAll.style.color = 'var(--accent-primary)';
                btnNone.style.color = 'var(--text-muted)';
            } else if (noneSelected) {
                btnAll.style.color = 'var(--text-muted)';
                btnNone.style.color = 'var(--accent-primary)';
            } else {
                btnAll.style.color = 'var(--text-muted)';
                btnNone.style.color = 'var(--text-muted)';
            }
        };

        // Initial state
        updateButtonStates();

        // Listener for "TODAS"
        container.querySelector('#btnPosAll')?.addEventListener('click', () => {
            const chips = container.querySelectorAll('.chip');
            chips.forEach(c => c.classList.add('active'));
            this.activeStates.add('without_coords');
            this.activeStates.add('with_coords');
            updateButtonStates();
            this.onFilterChange();
        });

        // Listener for "NINGUNO"
        container.querySelector('#btnPosNone')?.addEventListener('click', () => {
            const chips = container.querySelectorAll('.chip');
            chips.forEach(c => c.classList.remove('active'));
            this.activeStates.clear();
            updateButtonStates();
            this.onFilterChange();
        });

        // Listeners for Chips
        const chips = container.querySelectorAll('.chip');
        chips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                chip.classList.toggle('active');
                const val = chip.dataset.val;
                if (this.activeStates.has(val)) {
                    this.activeStates.delete(val);
                } else {
                    this.activeStates.add(val);
                }
                updateButtonStates();
                this.onFilterChange();
            });
        });
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
