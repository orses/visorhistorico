// search-worker.js — runs SearchEngine in a worker thread
import SearchEngine from './search-engine.js';

let engine = null;

/**
 * Pre-computa el texto buscable normalizado para cada entrada de metadatos.
 * Así search() no reconstruye el string en cada consulta.
 */
function precomputeSearchText(metadata, normalize) {
    for (const [filename, meta] of Object.entries(metadata)) {
        meta._searchableText = normalize([
            filename,
            meta.mainSubject,
            meta.location,
            meta.city,
            meta.author,
            meta.reign,
            meta.dateRange?.start?.toString(),
            meta.dateRange?.end?.toString(),
            meta.notes,
            ...(meta.tags     || []),
            ...(meta.centuries || [])
        ].filter(Boolean).join(' '));
    }
}

self.onmessage = ({ data }) => {
    if (data.type === 'INIT') {
        const fakeManager = {
            _data: data.metadata,
            getMetadata(f) { return this._data[f] || {}; },
            getAllMetadata() { return this._data; },
            getAllFilenames() { return Object.keys(this._data); }
        };
        engine = new SearchEngine(fakeManager);
        precomputeSearchText(data.metadata, engine.normalize.bind(engine));

    } else if (data.type === 'UPDATE') {
        if (engine) {
            engine.metadataManager._data = data.metadata;
            precomputeSearchText(data.metadata, engine.normalize.bind(engine));
        }

    } else if (data.type === 'SEARCH') {
        if (!engine) { self.postMessage({ id: data.id, results: [] }); return; }
        const results = engine.search(data.query);
        self.postMessage({ id: data.id, results });
    }
};
