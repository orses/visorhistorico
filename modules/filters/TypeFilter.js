/**
 * TypeFilter
 */
import BaseFilter from './BaseFilter.js';

export default class TypeFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'typeFilters');
        this.activeTypes = new Set();
        this.activeExtensions = new Set();
        this.DOCUMENT_TYPES = ['Dibujo', 'Fotografía', 'Grabado', 'Ilustración', 'Infografía 3D', 'Maqueta', 'Pintura', 'Plano', 'Recreación Visual', 'Texto'];
        this._typeMap = {};
        this._extMap  = {};
    }

    static _ext(filename) {
        const m = filename.match(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp)$/i);
        return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : null;
    }

    /** Reconstruye los mapas de conteo en O(n). */
    _buildCountMaps() {
        this._typeMap = {};
        this._extMap  = {};
        for (const filename of this.currentImages) {
            const meta = this.metadataManager.getMetadata(filename);
            const type = meta.type || 'UNKNOWN';
            this._typeMap[type] = (this._typeMap[type] || 0) + 1;

            const ext = TypeFilter._ext(filename);
            if (ext) this._extMap[ext] = (this._extMap[ext] || 0) + 1;
        }
    }

    getExtensions() {
        return Object.keys(this._extMap).sort();
    }

    countByType(type) {
        return this._typeMap[type] || 0;
    }

    countByExtension(ext) {
        return this._extMap[ext] || 0;
    }

    render() {
        if (!this.container) return;

        this._buildCountMaps();

        const extensions = this.getExtensions();

        const typeChips = this.DOCUMENT_TYPES.map(t => ({ value: t, label: t }));
        typeChips.push({ value: 'UNKNOWN', label: 'Sin tipo' });

        const extChips = extensions.map(e => ({ value: e, label: e.toUpperCase() }));

        let html = this.renderSection('TIPO DE DOCUMENTO', 'type', typeChips, 'type', {
            countFn: v => this.countByType(v)
        });
        html += this.renderSection('TIPO DE FORMATO', 'ext', extChips, 'ext', {
            countFn: v => this.countByExtension(v)
        });

        this.container.innerHTML = html;

        const updateState = () => {
            this.activeTypes      = this.collectActiveValues('type');
            this.activeExtensions = this.collectActiveValues('ext');
            this.updateBulkButtonStates('type', this.activeTypes,      'type');
            this.updateBulkButtonStates('ext',  this.activeExtensions, 'ext');
        };

        this.attachChipListeners('type', updateState);
        this.attachChipListeners('ext',  updateState);
        this.attachBulkListeners('type', 'type', updateState);
        this.attachBulkListeners('ext',  'ext',  updateState);
        updateState();
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        const type = meta.type || 'UNKNOWN';
        if (!this.activeTypes.has(type)) return false;

        const ext = TypeFilter._ext(filename);
        if (ext && !this.activeExtensions.has(ext)) return false;

        return true;
    }
}
