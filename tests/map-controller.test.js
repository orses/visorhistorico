import { describe, it, expect, beforeEach, vi } from 'vitest';

// MapController depends on Leaflet (DOM library). We test only the pure helper _esc.
// We stub Leaflet to avoid DOM dependency.
vi.mock('leaflet', () => ({
    default: {
        map: vi.fn(() => ({ on: vi.fn(), setView: vi.fn() })),
        tileLayer: vi.fn(() => ({})),
        tileLayer: { wms: vi.fn(() => ({})) },
        control: { layers: vi.fn(() => ({ addTo: vi.fn() })) },
        markerClusterGroup: vi.fn(() => ({ addTo: vi.fn(), removeLayer: vi.fn() })),
        layerGroup: vi.fn(() => ({ addTo: vi.fn() })),
        marker: vi.fn(() => ({ bindPopup: vi.fn(), on: vi.fn(), addTo: vi.fn() })),
        divIcon: vi.fn(() => ({})),
    },
}));

vi.mock('../modules/logger.js', () => ({
    default: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import the class after mocking
const { default: MapController } = await import('../map-controller.js');

describe('MapController._esc', () => {
    let mc;
    beforeEach(() => {
        // Avoid calling init() which needs a real DOM map container
        mc = Object.create(MapController.prototype);
    });

    it('escapes ampersands', () => {
        expect(mc._esc('A & B')).toBe('A &amp; B');
    });

    it('escapes < and >', () => {
        expect(mc._esc('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes double quotes', () => {
        expect(mc._esc('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
        expect(mc._esc("it's")).toBe("it&#39;s");
    });

    it('returns empty string for null/undefined', () => {
        expect(mc._esc(null)).toBe('');
        expect(mc._esc(undefined)).toBe('');
    });

    it('converts non-strings to string before escaping', () => {
        expect(mc._esc(42)).toBe('42');
    });

    it('leaves safe strings unchanged', () => {
        expect(mc._esc('Puerta del Sol')).toBe('Puerta del Sol');
    });
});
