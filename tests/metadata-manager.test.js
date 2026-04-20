import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock idb-keyval before importing MetadataManager
vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../modules/logger.js', () => ({
    default: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

describe('MetadataManager.resetForNewDirectory', () => {
    let mm;
    let revokeSpy;

    beforeEach(() => {
        mm = new MetadataManager();
        revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => {
        revokeSpy.mockRestore();
    });

    it('preserves manualEdits in memory (no data loss)', async () => {
        mm.manualEdits['foto.jpg'] = { notes: 'importante', _isUserMetadata: true };
        mm.manualEdits['otra.jpg'] = { author: 'Anon' };
        await mm.resetForNewDirectory();
        expect(mm.manualEdits['foto.jpg']).toEqual({ notes: 'importante', _isUserMetadata: true });
        expect(mm.manualEdits['otra.jpg']).toEqual({ author: 'Anon' });
    });

    it('does NOT call idb del for manualEdits key', async () => {
        const { del } = await import('idb-keyval');
        del.mockClear();
        await mm.resetForNewDirectory();
        expect(del).not.toHaveBeenCalled();
    });

    it('clears volatile metadata cache', async () => {
        mm.metadata['img.jpg'] = { mainSubject: 'Test', _isCacheValid: true };
        await mm.resetForNewDirectory();
        expect(mm.metadata).toEqual({});
    });

    it('clears userDatabase so it can be reloaded from JSON', async () => {
        mm.userDatabase['img.jpg'] = { mainSubject: 'Maestro' };
        await mm.resetForNewDirectory();
        expect(mm.userDatabase).toEqual({});
    });

    it('revokes blob URLs to free memory', async () => {
        mm.metadata['a.jpg'] = { _previewUrl: 'blob:http://localhost/abc' };
        mm.metadata['b.jpg'] = { _previewUrl: 'blob:http://localhost/def' };
        mm.metadata['c.jpg'] = { _previewUrl: 'https://cdn/real.jpg' }; // non-blob
        await mm.resetForNewDirectory();
        expect(revokeSpy).toHaveBeenCalledTimes(2);
        expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/abc');
        expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/def');
        expect(revokeSpy).not.toHaveBeenCalledWith('https://cdn/real.jpg');
    });

    it('clears internal caches and rebuilds normalized index', async () => {
        mm.normalizeKey('Madrid - Sol.jpg');
        mm.parseFilename('Madrid - Sol - 1900.jpg');
        expect(mm._normalizeCache.size).toBeGreaterThan(0);
        expect(mm._parseCache.size).toBeGreaterThan(0);

        mm.userDatabase['Madrid - Sol.jpg'] = { mainSubject: 'Sol' };
        await mm.resetForNewDirectory();
        expect(mm._normalizeCache.size).toBe(0);
        expect(mm._parseCache.size).toBe(0);
        expect(mm._normalizedIndex.size).toBe(0); // userDatabase was cleared first
    });

    it('is safe to call repeatedly (idempotent)', async () => {
        await mm.resetForNewDirectory();
        await mm.resetForNewDirectory();
        expect(mm.metadata).toEqual({});
        expect(mm.userDatabase).toEqual({});
    });
});

describe('MetadataManager.purgeManualEdits', () => {
    let mm;
    beforeEach(() => { mm = new MetadataManager(); });

    it('empties manualEdits in memory', async () => {
        mm.manualEdits['a.jpg'] = { notes: 'x' };
        mm.manualEdits['b.jpg'] = { author: 'y' };
        await mm.purgeManualEdits();
        expect(mm.manualEdits).toEqual({});
    });

    it('calls idb del with the correct key', async () => {
        const { del } = await import('idb-keyval');
        del.mockClear();
        await mm.purgeManualEdits();
        expect(del).toHaveBeenCalledWith('coleccion_historia_edits_manuales');
    });

    it('does not touch userDatabase or metadata cache', async () => {
        mm.userDatabase['a.jpg'] = { mainSubject: 'Base' };
        mm.metadata['a.jpg'] = { mainSubject: 'Base', _isCacheValid: true };
        mm.manualEdits['a.jpg'] = { notes: 'x' };
        await mm.purgeManualEdits();
        expect(mm.userDatabase['a.jpg']).toBeDefined();
        expect(mm.metadata['a.jpg']).toBeDefined();
    });
});

describe('MetadataManager.pruneOrphanEdits', () => {
    let mm;
    beforeEach(() => {
        mm = new MetadataManager();
        // Silence the debounced save during tests
        mm.suspendSave();
    });

    it('returns 0 when all edits match existing files', () => {
        mm.manualEdits['a.jpg'] = { notes: 'x' };
        mm.manualEdits['b.jpg'] = { notes: 'y' };
        const purged = mm.pruneOrphanEdits(['a.jpg', 'b.jpg', 'extra.jpg']);
        expect(purged).toBe(0);
        expect(Object.keys(mm.manualEdits)).toEqual(['a.jpg', 'b.jpg']);
    });

    it('removes edits not present in scanned filenames', () => {
        mm.manualEdits['keep.jpg'] = { notes: 'keep' };
        mm.manualEdits['orphan.jpg'] = { notes: 'gone' };
        const purged = mm.pruneOrphanEdits(['keep.jpg']);
        expect(purged).toBe(1);
        expect(mm.manualEdits['keep.jpg']).toBeDefined();
        expect(mm.manualEdits['orphan.jpg']).toBeUndefined();
    });

    it('preserves edits matching by case-insensitive normalization', () => {
        mm.manualEdits['foto.jpg'] = { notes: 'x' };
        const purged = mm.pruneOrphanEdits(['Foto.JPG']);
        expect(purged).toBe(0);
        expect(mm.manualEdits['foto.jpg']).toBeDefined();
    });

    it('preserves edits matching by accent-insensitive normalization', () => {
        mm.manualEdits['Cafe.jpg'] = { notes: 'x' };
        const purged = mm.pruneOrphanEdits(['Café.jpg']);
        expect(purged).toBe(0);
        expect(mm.manualEdits['Cafe.jpg']).toBeDefined();
    });

    it('preserves edits matching across image extensions', () => {
        mm.manualEdits['retiro.jpg'] = { notes: 'x' };
        // normalizeKey strips image extensions, so different exts normalize equal
        const purged = mm.pruneOrphanEdits(['retiro.tiff']);
        expect(purged).toBe(0);
        expect(mm.manualEdits['retiro.jpg']).toBeDefined();
    });

    it('treats a real rename as two different files (old purged)', () => {
        mm.manualEdits['Puerta del Sol.jpg'] = { notes: 'old' };
        const purged = mm.pruneOrphanEdits(['puerta_sol.jpg']);
        expect(purged).toBe(1);
        expect(mm.manualEdits['Puerta del Sol.jpg']).toBeUndefined();
    });

    it('purges all when no files are scanned', () => {
        mm.manualEdits['a.jpg'] = { notes: 'x' };
        mm.manualEdits['b.jpg'] = { notes: 'y' };
        mm.manualEdits['c.jpg'] = { notes: 'z' };
        const purged = mm.pruneOrphanEdits([]);
        expect(purged).toBe(3);
        expect(mm.manualEdits).toEqual({});
    });

    it('is a no-op when manualEdits is empty', () => {
        const purged = mm.pruneOrphanEdits(['a.jpg', 'b.jpg']);
        expect(purged).toBe(0);
        expect(mm.manualEdits).toEqual({});
    });

    it('removes entries whose key normalizes to empty string', () => {
        mm.manualEdits[''] = { notes: 'bad key' };
        mm.manualEdits['real.jpg'] = { notes: 'ok' };
        const purged = mm.pruneOrphanEdits(['real.jpg']);
        expect(purged).toBe(1);
        expect(mm.manualEdits['']).toBeUndefined();
        expect(mm.manualEdits['real.jpg']).toBeDefined();
    });

    it('ignores falsy entries in existingFilenames', () => {
        mm.manualEdits['a.jpg'] = { notes: 'x' };
        const purged = mm.pruneOrphanEdits(['a.jpg', '', null, undefined]);
        expect(purged).toBe(0);
        expect(mm.manualEdits['a.jpg']).toBeDefined();
    });

    it('triggers a debounced save when entries are purged', async () => {
        vi.useFakeTimers();
        const { set } = await import('idb-keyval');
        set.mockClear();

        // Re-enable saving for this test
        const mm2 = new MetadataManager();
        mm2.manualEdits['keep.jpg'] = { notes: 'k' };
        mm2.manualEdits['orphan.jpg'] = { notes: 'o' };

        mm2.pruneOrphanEdits(['keep.jpg']);
        // Debounce is 1000ms
        await vi.advanceTimersByTimeAsync(1100);

        expect(set).toHaveBeenCalledWith(
            'coleccion_historia_edits_manuales',
            expect.objectContaining({ 'keep.jpg': { notes: 'k' } })
        );
        // Orphan must not be persisted
        const lastCall = set.mock.calls[set.mock.calls.length - 1];
        expect(lastCall[1]).not.toHaveProperty('orphan.jpg');

        vi.useRealTimers();
    });

    it('does NOT trigger a save when no entries are purged', async () => {
        vi.useFakeTimers();
        const { set } = await import('idb-keyval');
        set.mockClear();

        const mm2 = new MetadataManager();
        mm2.manualEdits['a.jpg'] = { notes: 'x' };
        mm2.pruneOrphanEdits(['a.jpg']);
        await vi.advanceTimersByTimeAsync(1100);

        expect(set).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});

describe('MetadataManager — reload scenario integration', () => {
    let mm;
    let revokeSpy;

    beforeEach(() => {
        mm = new MetadataManager();
        revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => {
        revokeSpy.mockRestore();
    });

    it('preserves manual edits across a directory reload cycle', async () => {
        // 1. User edits metadata
        mm.manualEdits['foto.jpg'] = { notes: 'nota importante', _isUserMetadata: true };

        // 2. Page reloads → session restored → loadImagesFromDirectory runs reset
        await mm.resetForNewDirectory();

        // 3. Directory is scanned: foto.jpg is still there
        mm.pruneOrphanEdits(['foto.jpg']);

        // 4. Fusion still applies the user's edit
        const meta = mm.getMetadata('foto.jpg');
        expect(meta.notes).toBe('nota importante');
        expect(meta._isUserMetadata).toBe(true);
    });

    it('purges edits of images deleted from disk between reloads', async () => {
        mm.manualEdits['exists.jpg'] = { notes: 'A' };
        mm.manualEdits['deleted.jpg'] = { notes: 'B' };

        await mm.resetForNewDirectory();
        // Only 'exists.jpg' survives the scan
        const purged = mm.pruneOrphanEdits(['exists.jpg']);

        expect(purged).toBe(1);
        expect(mm.manualEdits['deleted.jpg']).toBeUndefined();
        expect(mm.manualEdits['exists.jpg']).toBeDefined();
    });

    it('detects newly added images as fresh entries (no stale manualEdits)', async () => {
        mm.manualEdits['old.jpg'] = { notes: 'old edit' };
        await mm.resetForNewDirectory();

        // Directory now includes a new file
        mm.pruneOrphanEdits(['old.jpg', 'brand-new.jpg']);

        const fresh = mm.getMetadata('brand-new.jpg');
        // No manual edits for the new file
        expect(fresh.notes).toBeUndefined();
        // _isUserMetadata is only set when there's user data — new file shouldn't have it
        expect(fresh._isUserMetadata).toBeFalsy();
        // Old edit still preserved
        expect(mm.getMetadata('old.jpg').notes).toBe('old edit');
    });

    it('re-importing a modified master JSON does not overwrite manual edits', async () => {
        mm.manualEdits['img.jpg'] = { author: 'Manual override' };
        await mm.resetForNewDirectory();

        mm.importFromJSON(JSON.stringify({
            'img.jpg': { author: 'From JSON', mainSubject: 'Test' },
        }));

        const meta = mm.getMetadata('img.jpg');
        // Manual layer wins over master layer
        expect(meta.author).toBe('Manual override');
        // But fields not overridden still come from master
        expect(meta.mainSubject).toBe('Test');
    });
});
