import { beforeEach, describe, expect, it, vi } from 'vitest';

import FilterManager from '../modules/FilterManager.js';

describe('FilterManager.applyFilters', () => {
    let filterManager;
    let onFilterUpdate;

    beforeEach(() => {
        const metadata = {
            ecuador: {
                coordinates: { lat: 0, lng: 0 },
                _userCoords: true
            },
            incompleta: {
                coordinates: { lat: 40.4 },
                _userCoords: true
            }
        };
        const metadataManager = {
            getMetadata: vi.fn(filename => metadata[filename])
        };
        onFilterUpdate = vi.fn();
        filterManager = new FilterManager(metadataManager, { search: vi.fn() }, onFilterUpdate);

        const alwaysMatches = { matches: vi.fn(() => true) };
        filterManager.centuryFilter = alwaysMatches;
        filterManager.typeFilter = alwaysMatches;
        filterManager.conservationFilter = alwaysMatches;
        filterManager.geographicFilter = alwaysMatches;
        filterManager.timelineFilter = alwaysMatches;
        filterManager.positioningFilter = alwaysMatches;
        filterManager.currentImages = ['ecuador', 'incompleta'];
        filterManager.updateFilterIndicator = vi.fn();
    });

    it('incluye en el mapa las coordenadas cero fijadas por el usuario', async () => {
        await filterManager.applyFilters();

        expect(onFilterUpdate).toHaveBeenCalledWith(
            ['ecuador', 'incompleta'],
            ['ecuador']
        );
    });
});
