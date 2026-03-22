/**
 * tiff-decoder
 * Decodifica imágenes TIFF en background usando un pool de Web Workers.
 * Cachea las miniaturas decodificadas en IndexedDB.
 */
import logger from './logger.js';
import { get, set, del } from 'idb-keyval';

export async function decodeTiffsInBackground(tiffs, { metadataManager, uiManager }) {
    const total = tiffs.length;
    if (total === 0) return;

    // Check IDB cache first and filter out already-cached TIFFs
    const pending = [];
    for (const tiff of tiffs) {
        const { name, file } = tiff;
        const cacheKey = `thumb_${name}`;
        const sizeKey = `thumb_size_${name}`;
        try {
            const cachedSize = await get(sizeKey);
            const cached = await get(cacheKey);
            if (cached && cachedSize === file.size) {
                // Cache hit: use cached blob
                const meta = metadataManager.getMetadata(name);
                if (meta._previewUrl && meta._previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(meta._previewUrl);
                }
                const url = URL.createObjectURL(cached);
                metadataManager.setVolatileData(name, { _previewUrl: url, _isProcessing: false });
                const card = document.querySelector(`[data-filename="${CSS.escape(name)}"]`);
                if (card) {
                    const imgBox = card.querySelector('.card-image-box');
                    if (imgBox) {
                        imgBox.innerHTML = `<img src="${url}" class="card-img" loading="lazy" alt="Preview">`;
                    }
                }
                // Invalidate stale cache if size mismatch
            } else {
                if (cached && cachedSize !== file.size) {
                    // Size changed — invalidate old cache
                    await del(cacheKey);
                    await del(sizeKey);
                }
                pending.push(tiff);
            }
        } catch (e) {
            pending.push(tiff);
        }
    }

    if (pending.length === 0) {
        uiManager.showToast(`${total} imágenes TIFF cargadas desde caché`, 'success');
        return;
    }

    const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 6, pending.length);
    let currentIndex = 0;
    let completedCount = 0;
    const pendingTotal = pending.length;

    logger.log(`Iniciando pool de ${numWorkers} workers para ${pendingTotal} TIFFs (${total - pendingTotal} desde caché)…`);

    const createWorker = () => {
        const worker = new Worker(new URL('../tiff-worker.js', import.meta.url), { type: 'module' });

        const processNext = () => {
            if (currentIndex >= pendingTotal) {
                worker.terminate();
                return;
            }

            const { name, file } = pending[currentIndex++];
            file.arrayBuffer()
                .then(buffer => {
                    worker.postMessage({ name, buffer, fileSize: file.size }, [buffer]);
                })
                .catch(err => {
                    logger.warn(`Error al leer ${name}:`, err);
                    completedCount++;
                    processNext();
                });
        };

        worker.onmessage = async (e) => {
            const { name, blob, ok, error } = e.data;
            completedCount++;

            if (ok) {
                const meta = metadataManager.getMetadata(name);
                if (meta._previewUrl && meta._previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(meta._previewUrl);
                }

                const previewUrl = URL.createObjectURL(blob);
                metadataManager.setVolatileData(name, { _previewUrl: previewUrl, _isProcessing: false });

                const card = document.querySelector(`[data-filename="${CSS.escape(name)}"]`);
                if (card) {
                    const imgBox = card.querySelector('.card-image-box');
                    if (imgBox) {
                        imgBox.innerHTML = `<img src="${previewUrl}" class="card-img" loading="lazy" alt="Preview">`;
                    }
                }

                // Save to IDB cache
                try {
                    const tiffEntry = pending.find(t => t.name === name);
                    const fileSize = tiffEntry ? tiffEntry.file.size : null;
                    await set(`thumb_${name}`, blob);
                    if (fileSize != null) await set(`thumb_size_${name}`, fileSize);
                } catch (cacheErr) {
                    logger.warn(`No se pudo guardar en caché: ${name}`, cacheErr);
                }
            } else {
                logger.warn(`TIFF fallido: ${name}`, error);
            }

            if (completedCount === pendingTotal) {
                uiManager.showToast(`${total} imágenes TIFF procesadas`, 'success');
                logger.log('Decodificación TIFF paralela completada.');
            }

            processNext();
        };

        worker.onerror = (err) => {
            logger.error('Error en tiff-worker:', err);
            completedCount++;
            processNext();
        };

        processNext();
    };

    for (let i = 0; i < numWorkers; i++) {
        setTimeout(createWorker, i * 150);
    }
}

/**
 * Decode a single TIFF file on demand.
 */
export async function decodeSingleTiff(filename, file, { metadataManager, uiManager }) {
    const cacheKey = `thumb_${filename}`;
    const sizeKey = `thumb_size_${filename}`;

    try {
        const cachedSize = await get(sizeKey);
        const cached = await get(cacheKey);
        if (cached && cachedSize === file.size) {
            const meta = metadataManager.getMetadata(filename);
            if (meta._previewUrl && meta._previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(meta._previewUrl);
            }
            const url = URL.createObjectURL(cached);
            metadataManager.setVolatileData(filename, { _previewUrl: url, _isProcessing: false, _needsDecode: false });
            uiManager.updateGalleryItem(filename);
            return;
        }
        if (cached && cachedSize !== file.size) {
            await del(cacheKey);
            await del(sizeKey);
        }
    } catch (e) {
        // Proceed with decode
    }

    const worker = new Worker(new URL('../tiff-worker.js', import.meta.url), { type: 'module' });
    const buffer = await file.arrayBuffer();
    worker.postMessage({ name: filename, buffer }, [buffer]);

    worker.onmessage = async (e) => {
        const { name, blob, ok, error } = e.data;
        worker.terminate();

        if (ok) {
            const meta = metadataManager.getMetadata(name);
            if (meta._previewUrl && meta._previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(meta._previewUrl);
            }
            const previewUrl = URL.createObjectURL(blob);
            metadataManager.setVolatileData(name, { _previewUrl: previewUrl, _isProcessing: false, _needsDecode: false });

            const card = document.querySelector(`[data-filename="${CSS.escape(name)}"]`);
            if (card) {
                const imgBox = card.querySelector('.card-image-box');
                if (imgBox) {
                    imgBox.innerHTML = `<img src="${previewUrl}" class="card-img" loading="lazy" alt="Preview">`;
                }
            }

            try {
                await set(cacheKey, blob);
                await set(sizeKey, file.size);
            } catch (cacheErr) {
                logger.warn(`No se pudo guardar en caché: ${name}`, cacheErr);
            }
        } else {
            logger.warn(`TIFF fallido (on-demand): ${name}`, error);
        }
    };

    worker.onerror = (err) => {
        logger.error('Error en tiff-worker (on-demand):', err);
        worker.terminate();
    };
}
