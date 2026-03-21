import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock idb-keyval before importing MetadataManager
vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../modules/logger.js', () => ({
    default: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock MetadataGeocoder
vi.mock('../modules/MetadataGeocoder.js', () => ({
    getCoordinates: vi.fn().mockReturnValue(null),
}));

const { default: MetadataManager } = await import('../metadata-manager.js');

describe('MetadataManager.normalizeKey', () => {
    let mm;
    beforeEach(() => { mm = new MetadataManager(); });

    it('returns empty string for falsy input', () => {
        expect(mm.normalizeKey('')).toBe('');
        expect(mm.normalizeKey(null)).toBe('');
    });

    it('strips accents', () => {
        expect(mm.normalizeKey('Café')).toBe('cafe');
    });

    it('strips Madrid- prefix', () => {
        expect(mm.normalizeKey('Madrid - Puerta del Sol.jpg')).toBe('puerta del sol');
    });

    it('strips image extensions', () => {
        expect(mm.normalizeKey('foto.jpeg')).toBe('foto');
        expect(mm.normalizeKey('foto.tiff')).toBe('foto');
    });

    it('lowercases and trims', () => {
        expect(mm.normalizeKey('  PLAZA MAYOR  ')).toBe('plaza mayor');
    });

    it('uses cache on repeated calls', () => {
        const first = mm.normalizeKey('Test.jpg');
        const second = mm.normalizeKey('Test.jpg');
        expect(first).toBe(second);
        expect(mm._normalizeCache.size).toBeGreaterThan(0);
    });
});

describe('MetadataManager.parseFilename', () => {
    let mm;
    beforeEach(() => { mm = new MetadataManager(); });

    it('extracts city and mainSubject from standard format', () => {
        const result = mm.parseFilename('Madrid - Puerta del Sol - 1890.jpg');
        expect(result.city).toBe('Madrid');
        expect(result.mainSubject).toBe('Puerta del Sol');
    });

    it('parses single year into dateRange', () => {
        const result = mm.parseFilename('Madrid - Retiro - 1900.jpg');
        expect(result.dateRange.start).toBe(1900);
        expect(result.dateRange.end).toBe(1900);
    });

    it('parses year range', () => {
        const result = mm.parseFilename('Madrid - Retiro - 1890 a 1910.jpg');
        expect(result.dateRange.start).toBe(1890);
        expect(result.dateRange.end).toBe(1910);
    });

    it('extracts author from brackets', () => {
        const result = mm.parseFilename('Madrid - Puerta del Sol [Juan García].jpg');
        expect(result.author).toBe('Juan García');
    });

    it('detects century from filename part', () => {
        // XVIII = X + V + III → matches regex ^(X{1,3}V?I{0,3})$
        const result = mm.parseFilename('Madrid - Retiro - XVIII.jpg');
        expect(result.centuries).toContain('XVIII');
    });

    it('infers century from year when not explicit', () => {
        const result = mm.parseFilename('Madrid - Plaza Mayor - 1850.jpg');
        expect(result.centuries).toContain('XIX');
    });

    it('returns fallback for files with no separator', () => {
        const result = mm.parseFilename('imagen_sin_formato.jpg');
        expect(result.mainSubject).toBeTruthy();
        expect(result.centuries).toEqual([]);
    });

    it('caches results', () => {
        mm.parseFilename('Madrid - Sol - 1900.jpg');
        mm.parseFilename('Madrid - Sol - 1900.jpg');
        expect(mm._parseCache.size).toBe(1);
    });
});

describe('MetadataManager.validateImportedEntry', () => {
    let mm;
    beforeEach(() => { mm = new MetadataManager(); });

    it('returns false for null/non-object', () => {
        expect(mm.validateImportedEntry(null)).toBe(false);
        expect(mm.validateImportedEntry('string')).toBe(false);
        expect(mm.validateImportedEntry(42)).toBe(false);
    });

    it('returns true for valid minimal entry', () => {
        expect(mm.validateImportedEntry({ mainSubject: 'Test' })).toBe(true);
    });

    it('returns false if dateRange.start is not a number', () => {
        expect(mm.validateImportedEntry({ dateRange: { start: '1900' } })).toBe(false);
    });

    it('returns true if dateRange values are numbers', () => {
        expect(mm.validateImportedEntry({ dateRange: { start: 1900, end: 1950 } })).toBe(true);
    });

    it('returns false if coordinates.lat is out of range', () => {
        expect(mm.validateImportedEntry({ coordinates: { lat: 95, lng: 0 } })).toBe(false);
    });

    it('returns false if coordinates.lng is out of range', () => {
        expect(mm.validateImportedEntry({ coordinates: { lat: 40, lng: 200 } })).toBe(false);
    });

    it('returns true for valid coordinates', () => {
        expect(mm.validateImportedEntry({ coordinates: { lat: 40.4, lng: -3.7 } })).toBe(true);
    });

    it('returns false if centuries is not an array', () => {
        expect(mm.validateImportedEntry({ centuries: 'XIX' })).toBe(false);
    });

    it('returns true if centuries is an array', () => {
        expect(mm.validateImportedEntry({ centuries: ['XIX', 'XX'] })).toBe(true);
    });

    it('returns false if tags is not an array', () => {
        expect(mm.validateImportedEntry({ tags: 'palacio' })).toBe(false);
    });
});

describe('MetadataManager.importFromJSON', () => {
    let mm;
    beforeEach(() => { mm = new MetadataManager(); });

    it('returns false for invalid JSON string', () => {
        expect(mm.importFromJSON('not json')).toBe(false);
    });

    it('returns false for non-object JSON', () => {
        expect(mm.importFromJSON(JSON.stringify([1, 2, 3]))).toBe(false);
    });

    it('imports valid entries and skips invalid ones', () => {
        const data = {
            'valid.jpg': { mainSubject: 'Retiro', centuries: ['XIX'] },
            'bad.jpg': { centuries: 'not-an-array' },
        };
        const result = mm.importFromJSON(JSON.stringify(data));
        expect(result).toBe(true);
        expect(mm.userDatabase['valid.jpg']).toBeDefined();
        expect(mm.userDatabase['bad.jpg']).toBeUndefined();
    });

    it('strips volatile fields on import', () => {
        const data = {
            'img.jpg': { mainSubject: 'Test', _previewUrl: 'blob:xxx', _fileSize: 1234 },
        };
        mm.importFromJSON(JSON.stringify(data));
        expect(mm.userDatabase['img.jpg']._previewUrl).toBeUndefined();
        expect(mm.userDatabase['img.jpg']._fileSize).toBeUndefined();
    });

    it('marks entries as user metadata', () => {
        const data = { 'img.jpg': { mainSubject: 'Test' } };
        mm.importFromJSON(JSON.stringify(data));
        expect(mm.userDatabase['img.jpg']._isUserMetadata).toBe(true);
    });
});

describe('MetadataManager.getMetadata (cache)', () => {
    let mm;
    beforeEach(() => { mm = new MetadataManager(); });

    it('returns metadata with _isCacheValid after first call', () => {
        const meta = mm.getMetadata('Madrid - Sol - 1900.jpg');
        expect(meta._isCacheValid).toBe(true);
    });

    it('returns cached result on second call', () => {
        const first = mm.getMetadata('Madrid - Sol - 1900.jpg');
        const second = mm.getMetadata('Madrid - Sol - 1900.jpg');
        expect(first).toBe(second);
    });

    it('manual edits override inferred data', () => {
        mm.manualEdits['img.jpg'] = { author: 'Override Author' };
        const meta = mm.getMetadata('img.jpg');
        expect(meta.author).toBe('Override Author');
    });
});
