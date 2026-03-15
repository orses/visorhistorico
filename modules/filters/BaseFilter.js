/**
 * BaseFilter
 * Clase base abstracta que centraliza la lógica compartida por todos los filtros.
 * Proporciona renderizado de secciones, gestión de chips, contadores y estados de botones.
 */
export default class BaseFilter {
    constructor(metadataManager, onFilterChange, containerId) {
        this.metadataManager = metadataManager;
        this.onFilterChange = onFilterChange;
        this.container = document.getElementById(containerId);
        this.currentImages = [];
    }

    /**
     * Almacena la lista completa de imágenes cargadas (para contadores).
     * @param {string[]} images
     */
    setImages(images) {
        this.currentImages = images;
    }

    /**
     * Genera el HTML de una sección de filtro con clases CSS.
     * @param {string} label - Etiqueta de la sección (ej. «SIGLO»)
     * @param {string} group - Identificador del grupo (ej. «century», «status»)
     * @param {Array<{value: string, label: string}>} chips - Definición de chips
     * @param {string} dataAttr - Nombre del atributo data- (ej. «century», «status»)
     * @param {Object} [options]
     * @param {boolean}  [options.allActive=true] - Todos los chips activos por defecto
     * @param {Set}      [options.activeSet=null] - Si se proporciona, determina el estado de cada chip
     * @param {Function} [options.countFn=null] - Función(valor) → número para mostrar junto al chip
     * @param {string}   [options.allLabel='TODOS'] - Texto del botón «todos»
     * @param {string}   [options.noneLabel='NINGUNO'] - Texto del botón «ninguno»
     * @returns {string} HTML
     */
    renderSection(label, group, chips, dataAttr, options = {}) {
        const {
            allActive = true,
            activeSet = null,
            countFn = null,
            allLabel = 'TODOS',
            noneLabel = 'NINGUNO'
        } = options;

        const showCounts = this.currentImages.length > 0 && countFn !== null;

        let html = `
            <div class="filter-section ${options.collapsed ? 'collapsed' : ''}" data-group="${group}">
                <div class="filter-header">
                    <button class="filter-toggle-btn" data-group="${group}">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <span class="filter-label">${label}:</span>
                    <button class="filter-btn" data-action="select-all" data-group="${group}">${allLabel}</button>
                    <button class="filter-btn" data-action="select-none" data-group="${group}">${noneLabel}</button>
                    <div class="filter-separator"></div>
                </div>
                <div class="filter-chips-wrapper">
                    <div class="filter-chips">
        `;
 
        chips.forEach(chip => {
            const isActive = activeSet ? activeSet.has(chip.value) : allActive;
            const countStr = showCounts ? ` <span class="chip-count">${countFn(chip.value)}</span>` : '';
            html += `<div class="chip ${isActive ? 'active' : ''}" data-${dataAttr}="${chip.value}">${chip.label}${countStr}</div>`;
        });
 
        html += `</div></div></div>`;
        return html;
    }

    /**
     * Añade listeners de toggle a los chips con el atributo data indicado.
     * @param {string} dataAttr
     * @param {Function} onUpdate - Callback tras cada toggle
     */
    attachChipListeners(dataAttr, onUpdate) {
        this.container.querySelectorAll(`.chip[data-${dataAttr}]`).forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                if (onUpdate) onUpdate();
                this.onFilterChange();
            });
        });
    }

    /**
     * Añade listeners de control masivo (TODOS / NINGUNO) por grupo.
     * @param {string} group - Identificador del grupo
     * @param {string} dataAttr - Atributo data- de los chips
     * @param {Function} onUpdate
     */
    attachBulkListeners(group, dataAttr, onUpdate) {
        this.container.querySelector(`[data-action="select-all"][data-group="${group}"]`)?.addEventListener('click', () => {
            this.container.querySelectorAll(`.chip[data-${dataAttr}]`).forEach(c => c.classList.add('active'));
            if (onUpdate) onUpdate();
            this.onFilterChange();
        });
        this.container.querySelector(`[data-action="select-none"][data-group="${group}"]`)?.addEventListener('click', () => {
            this.container.querySelectorAll(`.chip[data-${dataAttr}]`).forEach(c => c.classList.remove('active'));
            if (onUpdate) onUpdate();
            this.onFilterChange();
        });

        // Toggle Colapso
        this.container.querySelector(`.filter-toggle-btn[data-group="${group}"]`)?.addEventListener('click', (e) => {
            const section = e.target.closest('.filter-section');
            section.classList.toggle('collapsed');
        });
    }

    /**
     * Actualiza el estilo visual de los botones TODOS/NINGUNO según el estado actual.
     * @param {string} group - Identificador del grupo
     * @param {Set} activeSet - Conjunto de valores activos
     * @param {string} dataAttr
     */
    updateBulkButtonStates(group, activeSet, dataAttr) {
        const btnAll = this.container.querySelector(`[data-action="select-all"][data-group="${group}"]`);
        const btnNone = this.container.querySelector(`[data-action="select-none"][data-group="${group}"]`);
        if (!btnAll || !btnNone) return;

        const allChips = this.container.querySelectorAll(`.chip[data-${dataAttr}]`);
        const allSelected = Array.from(allChips).every(c => c.classList.contains('active'));
        const noneSelected = activeSet.size === 0;

        // Reset
        btnAll.classList.remove('filter-btn--active');
        btnNone.classList.remove('filter-btn--active');

        if (allSelected) {
            btnAll.classList.add('filter-btn--active');
        } else if (noneSelected) {
            btnNone.classList.add('filter-btn--active');
        }
    }

    /**
     * Recopila los valores activos de los chips con el atributo data indicado.
     * @param {string} dataAttr
     * @returns {Set<string>}
     */
    collectActiveValues(dataAttr) {
        return new Set(
            Array.from(this.container.querySelectorAll(`.chip.active[data-${dataAttr}]`))
                .map(c => c.dataset[dataAttr])
        );
    }

    /**
     * Limpia el contenedor y libera referencias.
     */
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * Comprueba si un fichero pasa el filtro. Debe implementarse en cada subclase.
     * @param {string} filename
     * @returns {boolean}
     */
    matches(filename) {
        throw new Error(`${this.constructor.name}.matches() debe ser implementado por la subclase.`);
    }
}
