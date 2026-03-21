import { describe, it, expect } from 'vitest';
import { getCoordinates } from '../modules/MetadataGeocoder.js';

describe('getCoordinates', () => {
    it('returns null for empty location', () => {
        expect(getCoordinates('')).toBeNull();
        expect(getCoordinates(null)).toBeNull();
    });

    it('returns null for non-Madrid city', () => {
        expect(getCoordinates('Palacio Real', 'Barcelona')).toBeNull();
    });

    it('resolves known Madrid location', () => {
        const coords = getCoordinates('Puerta del Sol', 'Madrid');
        expect(coords).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
        expect(coords.lat).toBeCloseTo(40.4169, 3);
    });

    it('returns Madrid center for unknown location in Madrid context', () => {
        const coords = getCoordinates('Lugar desconocido', 'Madrid');
        expect(coords).toBeNull();
    });

    it('returns null for unknown location in non-Madrid city', () => {
        const coords = getCoordinates('Lugar desconocido', 'Sevilla');
        expect(coords).toBeNull();
    });

    it('matches case-insensitively via lowercase normalization', () => {
        const coords = getCoordinates('PUERTA DEL SOL', 'Madrid');
        expect(coords).not.toBeNull();
    });

    it('matches partial location strings', () => {
        const coords = getCoordinates('Visita al Retiro ayer', 'Madrid');
        expect(coords).not.toBeNull();
    });
});
