// search-worker.js — runs SearchEngine in a worker thread
import SearchEngine from './search-engine.js';

let engine = null;

self.onmessage = ({ data }) => {
    if (data.type === 'INIT') {
        // data.metadata: object of filename → metadata
        const fakeManager = {
            _data: data.metadata,
            getMetadata(f) { return this._data[f] || {}; },
            getAllMetadata() { return this._data; },
            getAllFilenames() { return Object.keys(this._data); }
        };
        engine = new SearchEngine(fakeManager);
    } else if (data.type === 'UPDATE') {
        if (engine) {
            engine.metadataManager._data = data.metadata;
        }
    } else if (data.type === 'SEARCH') {
        if (!engine) { self.postMessage({ id: data.id, results: [] }); return; }
        const results = engine.search(data.query);
        self.postMessage({ id: data.id, results });
    }
};
