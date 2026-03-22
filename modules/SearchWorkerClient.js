/**
 * SearchWorkerClient — async interface to search-worker.js
 *
 * Mejora: al iniciar una nueva búsqueda, las promesas pendientes se resuelven
 * inmediatamente con [] para que el pipeline no quede bloqueado esperando
 * resultados que ya no interesan.
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
            // Si el id ya no está en el mapa, era una búsqueda cancelada → ignorar
        };
    }

    init(metadata) {
        this._worker.postMessage({ type: 'INIT', metadata });
    }

    update(metadata) {
        this._worker.postMessage({ type: 'UPDATE', metadata });
    }

    search(query) {
        // Cancelar todas las búsquedas pendientes: ya no son relevantes
        for (const resolve of this._pending.values()) {
            resolve([]);
        }
        this._pending.clear();

        return new Promise(resolve => {
            const id = ++this._idCounter;
            this._pending.set(id, resolve);
            this._worker.postMessage({ type: 'SEARCH', id, query });
        });
    }
}
