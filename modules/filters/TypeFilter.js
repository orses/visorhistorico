/**
 * TypeFilter
 * Handles rendering and logic for Document Type and File Extension filtering.
 */
import BaseFilter from './BaseFilter.js';

export default class TypeFilter extends BaseFilter {
    constructor(metadataManager, onFilterChange) {
        super(metadataManager, onFilterChange, 'typeFilters');
        this.activeTypes = new Set();
        this.activeExtensions = new Set();
        this.DOCUMENT_TYPES = ['Dibujo', 'Fotografía', 'Grabado', 'Ilustración', 'Infografía 3D', 'Maqueta', 'Pintura', 'Plano', 'Recreación Visual', 'Texto'];
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

    countByType(type) {
        return this.currentImages.filter(filename => {
            const meta = this.metadataManager.getMetadata(filename);
            if (type === 'UNKNOWN') return !meta.type;
            return meta.type === type;
        }).length;
    }

    countByExtension(ext) {
        return this.currentImages.filter(filename => {
            const match = filename.match(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp)$/i);
            const fileExt = match ? match[1].toLowerCase().replace('jpeg', 'jpg') : null;
            return fileExt === ext;
        }).length;
    }

    render() {
        if (!this.container) return;

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
            this.activeTypes = this.collectActiveValues('type');
            this.activeExtensions = this.collectActiveValues('ext');
            this.updateBulkButtonStates('type', this.activeTypes, 'type');
            this.updateBulkButtonStates('ext', this.activeExtensions, 'ext');
        };

        this.attachChipListeners('type', updateState);
        this.attachChipListeners('ext', updateState);
        this.attachBulkListeners('type', 'type', updateState);
        this.attachBulkListeners('ext', 'ext', updateState);
        updateState();
    }

    matches(filename) {
        const meta = this.metadataManager.getMetadata(filename);

        const type = meta.type || 'UNKNOWN';
        if (!this.activeTypes.has(type)) return false;

        const fileExt = filename.match(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp)$/i);
        const ext = fileExt ? fileExt[1].toLowerCase().replace('jpeg', 'jpg') : null;
        if (ext && !this.activeExtensions.has(ext)) return false;

        return true;
    }
}
