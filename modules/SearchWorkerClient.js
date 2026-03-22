/**
 * SearchWorkerClient — async interface to search-worker.js
 */
export default class SearchWorkerClient {
    constructor() {
        this._worker = new Worker(new URL('../search-worker.js', import.meta.url), { type: 'module' });
        this._pending = new Map();
        this._idCounter = 0;
        this._worker.onmessage = ({ data }) => {
            const resolve = this._pending.get(data.id);
            if (resolve) {
                this._pending.delete(data.id);
                resolve(data.results);
            }
        };
    }

    init(metadata) {
        this._worker.postMessage({ type: 'INIT', metadata });
    }

    update(metadata) {
        this._worker.postMessage({ type: 'UPDATE', metadata });
    }

    search(query) {
        return new Promise(resolve => {
            const id = ++this._idCounter;
            this._pending.set(id, resolve);
            this._worker.postMessage({ type: 'SEARCH', id, query });
        });
    }
}
