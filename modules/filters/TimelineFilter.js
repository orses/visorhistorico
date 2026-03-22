/**
 * TimelineFilter — dual year range slider filter.
 */
export default class TimelineFilter {
    constructor(metadataManager, onFilterChange) {
        this.metadataManager = metadataManager;
        this.onFilterChange = onFilterChange;
        this.container = document.getElementById('timelineFilter');
        this.currentImages = [];
        this.minYear = 1500;
        this.maxYear = new Date().getFullYear();
        this.activeMin = this.minYear;
        this.activeMax = this.maxYear;
        this._enabled = false;
    }

    setImages(images) {
        this.currentImages = images;
        // Compute actual year range from data
        let min = Infinity, max = -Infinity;
        images.forEach(f => {
            const meta = this.metadataManager.getMetadata(f);
            const s = meta.dateRange?.start;
            const e = meta.dateRange?.end;
            if (s && s > 0) { if (s < min) min = s; if (s > max) max = s; }
            if (e && e > 0) { if (e < min) min = e; if (e > max) max = e; }
        });
        if (min !== Infinity) {
            this.minYear = min;
            this.maxYear = max;
            // Only reset range if not yet set by user
            if (!this._userSet) {
                this.activeMin = min;
                this.activeMax = max;
            }
        }
    }

    render() {
        if (!this.container) return;
        const checked = this._enabled ? 'checked' : '';
        this.container.innerHTML = `
            <div class="filter-section" data-group="timeline">
                <div class="filter-header">
                    <button class="filter-toggle-btn" data-group="timeline">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <span class="filter-label">CRONOLOGÍA:</span>
                    <label class="timeline-toggle-label">
                        <input type="checkbox" id="timelineEnabled" ${checked}> Activar
                    </label>
                </div>
                <div class="filter-chips-wrapper">
                    <div class="timeline-slider-wrap">
                        <div class="timeline-labels">
                            <span id="timelineMinLabel">${this.activeMin}</span>
                            <span id="timelineMaxLabel">${this.activeMax}</span>
                        </div>
                        <div class="timeline-range-wrap">
                            <input type="range" id="timelineRangeMin" min="${this.minYear}" max="${this.maxYear}" value="${this.activeMin}" step="1" class="timeline-range timeline-range-min" ${this._enabled ? '' : 'disabled'}>
                            <input type="range" id="timelineRangeMax" min="${this.minYear}" max="${this.maxYear}" value="${this.activeMax}" step="1" class="timeline-range timeline-range-max" ${this._enabled ? '' : 'disabled'}>
                        </div>
                        <div class="timeline-track-wrap">
                            <div class="timeline-track"></div>
                            <div class="timeline-track-fill" id="timelineTrackFill"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this._updateFill();
        this._attachListeners();

        // collapse toggle
        this.container.querySelector('.filter-toggle-btn')?.addEventListener('click', e => {
            e.target.closest('.filter-section').classList.toggle('collapsed');
        });
    }

    _updateFill() {
        const fill = this.container?.querySelector('#timelineTrackFill');
        if (!fill) return;
        const range = this.maxYear - this.minYear || 1;
        const left = ((this.activeMin - this.minYear) / range) * 100;
        const right = ((this.activeMax - this.minYear) / range) * 100;
        fill.style.left = left + '%';
        fill.style.width = (right - left) + '%';
    }

    _attachListeners() {
        const minInput = this.container.querySelector('#timelineRangeMin');
        const maxInput = this.container.querySelector('#timelineRangeMax');
        const minLabel = this.container.querySelector('#timelineMinLabel');
        const maxLabel = this.container.querySelector('#timelineMaxLabel');
        const enabledCb = this.container.querySelector('#timelineEnabled');

        enabledCb?.addEventListener('change', () => {
            this._enabled = enabledCb.checked;
            if (minInput) minInput.disabled = !this._enabled;
            if (maxInput) maxInput.disabled = !this._enabled;
            if (!this._enabled) { this._userSet = false; }
            this.onFilterChange();
        });

        const update = () => {
            let minVal = parseInt(minInput.value);
            let maxVal = parseInt(maxInput.value);
            if (minVal > maxVal) { [minVal, maxVal] = [maxVal, minVal]; }
            this.activeMin = minVal;
            this.activeMax = maxVal;
            this._userSet = true;
            if (minLabel) minLabel.textContent = minVal;
            if (maxLabel) maxLabel.textContent = maxVal;
            this._updateFill();
            this.onFilterChange();
        };

        minInput?.addEventListener('input', update);
        maxInput?.addEventListener('input', update);
    }

    matches(filename) {
        if (!this._enabled) return true;
        const meta = this.metadataManager.getMetadata(filename);
        const s = meta.dateRange?.start;
        const e = meta.dateRange?.end || s;
        if (!s) return false; // no date → exclude when timeline active
        // overlaps if image range intersects selected range
        return s <= this.activeMax && (e >= this.activeMin);
    }

    reset() {
        this._enabled = false;
        this._userSet = false;
        this.activeMin = this.minYear;
        this.activeMax = this.maxYear;
        this.render();
    }

    hasActiveFilter() {
        return this._enabled;
    }
}
