/**
 * GalleryRenderer
 * Handles gallery grid rendering, item creation, and multi-selection logic.
 */
export default class GalleryRenderer {
    constructor(metadataManager, galleryGridEl, filteredCountEl, onSelectImage) {
        this.metadataManager = metadataManager;
        this.galleryGridEl = galleryGridEl;
        this.filteredCountEl = filteredCountEl;
        this.onSelectImage = onSelectImage;
        this.onOpenOriginal = null;

        this.selectedImages = new Set();
        this.lastSelectedImage = null;
        this._renderContext = null;
        this._lastFilesHash = null;
    }

    async renderGallery(files) {
        if (this._renderContext) {
            this._renderContext.cancelled = true;
        }

        const newHash = files.join('|');
        if (this._lastFilesHash && this._lastFilesHash === newHash) {
            this.applySelectionStyles();
            return;
        }
        this._lastFilesHash = newHash;

        this.galleryGridEl.innerHTML = '';
        const context = { cancelled: false };
        this._renderContext = context;

        if (files.length > 0) {
            this.filteredCountEl.innerHTML = `<b>${files.length}</b> res.`;
            this.filteredCountEl.classList.remove('hidden');
        } else {
            this.filteredCountEl.textContent = `0 res.`;
            this.filteredCountEl.classList.add('hidden');
        }

        const batchSize = 25;
        let index = 0;

        const renderBatch = async () => {
            if (context.cancelled) return;

            const fragment = document.createDocumentFragment();
            const end = Math.min(index + batchSize, files.length);

            for (let i = index; i < end; i++) {
                const card = this.createGalleryItem(files[i]);
                if (this.selectedImages.has(files[i])) {
                    card.classList.add('selected');
                }
                fragment.appendChild(card);
            }

            this.galleryGridEl.appendChild(fragment);
            index = end;

            if (index < files.length) {
                requestAnimationFrame(() => renderBatch());
            }
        };

        if (files.length > 0) {
            await renderBatch();
        } else {
            this.filteredCountEl.textContent = `0 resultados`;
            this.filteredCountEl.classList.add('hidden');
        }
    }

    // Genera el transform completo para card-img, combinando centrado + rotación + escala.
    // El box es 4:3 (padding-top:75%), así que en 90°/270° escala a 0.75 para que la imagen no desborde.
    _cardRotateTransform(rotation) {
        const deg = rotation || 0;
        const side = (deg === 90 || deg === 270) ? ' scale(0.75)' : '';
        return `translate(-50%, -50%) rotate(${deg}deg)${side}`;
    }

    computeCompleteness(meta) {
        let filled = 0;
        if (meta.mainSubject) filled++;
        if (meta.author) filled++;
        if (meta.location && meta.location !== meta.city) filled++;
        if (meta.dateRange?.start) filled++;
        if ((meta.centuries || []).length > 0) filled++;
        if (meta.type) filled++;
        if (meta.conservationStatus && meta.conservationStatus !== 'Sin clasificar') filled++;
        if (meta.coordinates?.lat != null) filled++;
        if (meta.sourceUrl) filled++;
        if (meta.notes && meta.notes.trim()) filled++;
        return Math.round((filled / 10) * 100);
    }

    createGalleryItem(filename) {
        const meta = this.metadataManager.getMetadata(filename);
        const div = document.createElement('div');
        div.className = 'params-card';
        div.dataset.filename = filename;
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        div.setAttribute('aria-label', `${meta.mainSubject || filename}${meta.dateRange?.start ? ', ' + meta.dateRange.start : ''}`);
        div.onclick = (e) => this.handleImageClick(e, filename);
        div.ondblclick = () => {
            if (this.onOpenOriginal) this.onOpenOriginal(filename);
        };
        div.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.handleImageClick(e, filename);
            }
        };

        const status = meta.conservationStatus || 'Sin clasificar';
        const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '-');
        const statusDot = `<span class="status-dot ${statusClass}" title="${status}" aria-label="Estado: ${status}"></span>`;

        const thumbPath = meta._previewUrl || filename;
        const rotStyle = ` style="transform:${this._cardRotateTransform(meta.rotation)}"`;
        const imageHTML = meta._isProcessing ?
            `<div class="skeleton-box" role="status" aria-label="Procesando imagen..."></div>` :
            `<img src="${thumbPath}" class="card-img" loading="lazy" alt="${meta.mainSubject || filename}"${rotStyle}>`;

        const pct = this.computeCompleteness(meta);

        div.innerHTML = `
            <div class="card-image-box">
                ${imageHTML}
            </div>
            <div class="card-info">
                <div class="card-title" title="${meta.mainSubject}">${meta.mainSubject}</div>
                <div class="card-meta">
                    <div class="card-meta-row">
                        <span class="card-date">${statusDot}${meta.dateRange?.start || 'S.D.'}</span>
                        <span class="card-century">${(meta.centuries || []).join(', ')}</span>
                    </div>
                    <div class="card-meta-row">
                        <span class="card-author" title="${meta.author || 'Anónimo'}">${meta.author || 'Anónimo'}</span>
                    </div>
                </div>
                <div class="meta-progress" title="Completitud de metadatos: ${pct}%"><div class="meta-progress-bar" style="width:${pct}%;--pct:${pct}"></div></div>
            </div>
        `;
        return div;
    }

    handleImageClick(e, filename) {
        if (e.shiftKey && this.lastSelectedImage) {
            const cards = Array.from(this.galleryGridEl.children);
            const startIdx = cards.findIndex(c => c.dataset.filename === this.lastSelectedImage);
            const endIdx = cards.findIndex(c => c.dataset.filename === filename);

            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);

                if (!e.ctrlKey && !e.metaKey) {
                    this.selectedImages.clear();
                }

                for (let i = min; i <= max; i++) {
                    this.selectedImages.add(cards[i].dataset.filename);
                }
            }
            this.lastSelectedImage = filename;
        } else if (e.ctrlKey || e.metaKey) {
            if (this.selectedImages.has(filename)) {
                this.selectedImages.delete(filename);
                if (this.lastSelectedImage === filename) {
                    this.lastSelectedImage = this.selectedImages.size > 0 ? Array.from(this.selectedImages).pop() : null;
                }
            } else {
                this.selectedImages.add(filename);
                this.lastSelectedImage = filename;
            }
        } else {
            if (this.selectedImages.size >= 5 && !this.selectedImages.has(filename)) {
                if (!confirm(`Tienes ${this.selectedImages.size} imágenes seleccionadas. ¿Deseas descartar la selección para ver solo esta?`)) {
                    return;
                }
            }
            this.selectedImages.clear();
            this.selectedImages.add(filename);
            this.lastSelectedImage = filename;
        }

        this.applySelectionStyles();

        const primaryFocus = this.lastSelectedImage;
        const allSelected = Array.from(this.selectedImages);
        this.onSelectImage(primaryFocus, allSelected);
    }

    applySelectionStyles() {
        this.galleryGridEl.querySelectorAll('.params-card').forEach(c => {
            const file = c.dataset.filename;
            const isSelected = this.selectedImages.has(file);
            c.classList.toggle('selected', isSelected);
            c.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
    }

    updateSelection(filenames, forceSingle = true) {
        if (forceSingle) {
            this.selectedImages.clear();
        }

        const filesToSelect = Array.isArray(filenames) ? filenames : [filenames];
        filesToSelect.forEach(f => { if (f) this.selectedImages.add(f); });

        if (filesToSelect.length > 0) {
            this.lastSelectedImage = filesToSelect[filesToSelect.length - 1];
        }

        this.applySelectionStyles();

        if (this.lastSelectedImage) {
            const card = this.galleryGridEl.querySelector(`[data-filename="${CSS.escape(this.lastSelectedImage)}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (this.onSelectImage) {
            this.onSelectImage(this.lastSelectedImage, Array.from(this.selectedImages));
        }
    }

    updateGalleryItem(filename) {
        const card = this.galleryGridEl.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
        if (!card) return;

        const meta = this.metadataManager.getMetadata(filename);
        const status = meta.conservationStatus || 'Sin clasificar';
        const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '-');

        const titleEl = card.querySelector('.card-title');
        if (titleEl) {
            titleEl.textContent = meta.mainSubject || 'Sin título';
            titleEl.title = meta.mainSubject || '';
        }

        const metaEl = card.querySelector('.card-meta');
        if (metaEl) {
            metaEl.innerHTML = `
                <div class="card-meta-row">
                    <span class="card-date"><span class="status-dot ${statusClass}" title="${status}" aria-label="Estado: ${status}"></span>${meta.dateRange?.start || 'S.D.'}</span>
                    <span class="card-century">${(meta.centuries || []).join(', ')}</span>
                </div>
                <div class="card-meta-row">
                    <span class="card-author" title="${meta.author || 'Anónimo'}">${meta.author || 'Anónimo'}</span>
                </div>
            `;
        }

        card.setAttribute('aria-label', `${meta.mainSubject || filename}${meta.dateRange?.start ? ', ' + meta.dateRange.start : ''}`);

        const cardImg = card.querySelector('.card-img');
        if (cardImg) cardImg.style.transform = this._cardRotateTransform(meta.rotation);

        const pct = this.computeCompleteness(meta);
        const progressBar = card.querySelector('.meta-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${pct}%`;
            progressBar.style.setProperty('--pct', pct);
        }
        const progressEl = card.querySelector('.meta-progress');
        if (progressEl) progressEl.title = `Completitud de metadatos: ${pct}%`;
    }
}
