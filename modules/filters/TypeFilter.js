/**
 * TypeFilter
 * Handles rendering and logic for Document Type and File Extension filtering.
 */
export default class TypeFilter {
    constructor(metadataManager, onFilterChange) {
        this.metadataManager = metadataManager;
        this.onFilterChange = onFilterChange;
        this.container = document.getElementById('typeFilters');
        this.currentImages = [];

        this.activeTypes = new Set();
        this.activeExtensions = new Set();

        this.DOCUMENT_TYPES = ['Fotografía', 'Grabado', 'Pintura', 'Plano', 'Texto', 'Dibujo'];
    }

    setImages(images) {
        this.currentImages = images;
    }

    getExtensions() {
        const extensions = new Set();
        this.currentImages.forEach(filename => {
            const match = filename.match(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp)$/i);
            if (match) {
                extensions.add(match[1].toLowerCase().replace('jpeg', 'jpg'));
            }
        });
        return Array.from(extensions).sort();
    }

    render() {
        if (!this.container) return;

        // Container is dedicated, but we keep the wrapper if desired for architecture
        let typeWrapper = this.container;

        const extensions = this.getExtensions();

        // --- TYPE FILTER HTML ---
        let html = `
            <!-- FILTRO DE TIPO DE DOCUMENTO -->
            <div style="display:flex; gap:8px; margin-bottom:4px; align-items:center; padding-left:2px;">
                 <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; min-width:fit-content;">TIPO DE DOCUMENTO:</span>
                 <button id="btnTypeAll" style="background:none; border:none; color:var(--accent-primary); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">TODOS</button>
                 <button id="btnTypeNone" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">NINGUNO</button>
                 <div style="height:1px; background:var(--border-color); flex:1;"></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        `;

        html += this.DOCUMENT_TYPES.map(t => `<div class="chip active" data-type="${t}">${t}</div>`).join('');
        html += `<div class="chip active" data-type="UNKNOWN">Sin tipo</div>`;
        html += `</div>`;

        // --- EXTENSION FILTER HTML ---
        html += `
            <!-- FILTRO DE EXTENSIÓN -->
            <div style="display:flex; gap:8px; margin-bottom:4px; align-items:center; padding-left:2px;">
                 <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; min-width:fit-content;">TIPO DE FORMATO:</span>
                 <button id="btnExtAll" style="background:none; border:none; color:var(--accent-primary); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">TODOS</button>
                 <button id="btnExtNone" style="background:none; border:none; color:var(--text-muted); font-size:0.7rem; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; padding:0;">NINGUNO</button>
                 <div style="height:1px; background:var(--border-color); flex:1;"></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        `;

        html += extensions.map(e => `<div class="chip active" data-ext="${e}">${e.toUpperCase()}</div>`).join('');
        html += `</div>`;

        typeWrapper.innerHTML = html;

        // LISTENERS
        this.attachListeners(typeWrapper);
        this.updateState(typeWrapper);
    }

    attachListeners(container) {
        // Chips
        container.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                this.updateState(container);
                this.onFilterChange();
            });
        });

        // Controls
        container.querySelector('#btnTypeAll')?.addEventListener('click', () => {
            container.querySelectorAll('[data-type]').forEach(c => c.classList.add('active'));
            this.updateState(container);
            this.onFilterChange();
        });
        container.querySelector('#btnTypeNone')?.addEventListener('click', () => {
            container.querySelectorAll('[data-type]').forEach(c => c.classList.remove('active'));
            this.updateState(container);
            this.onFilterChange();
        });
        container.querySelector('#btnExtAll')?.addEventListener('click', () => {
            container.querySelectorAll('[data-ext]').forEach(c => c.classList.add('active'));
            this.updateState(container);
            this.onFilterChange();
        });
        container.querySelector('#btnExtNone')?.addEventListener('click', () => {
            container.querySelectorAll('[data-ext]').forEach(c => c.classList.remove('active'));
            this.updateState(container);
            this.onFilterChange();
        });
    }

    updateState(container) {
        this.activeTypes = new Set(
            Array.from(container.querySelectorAll('.chip.active[data-type]')).map(c => c.dataset.type)
        );
        this.activeExtensions = new Set(
            Array.from(container.querySelectorAll('.chip.active[data-ext]')).map(c => c.dataset.ext)
        );
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);

        // Type check
        const type = meta.type || 'UNKNOWN';
        if (!this.activeTypes.has(type)) return false;

        // Extension check
        const fileExt = filename.match(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp)$/i);
        const ext = fileExt ? fileExt[1].toLowerCase().replace('jpeg', 'jpg') : null;
        if (ext && !this.activeExtensions.has(ext)) return false;

        return true;
    }
}
