/**
 * tiff-decoder
 * Decodifica imágenes TIFF en background usando un pool de Web Workers.
 */
import logger from './logger.js';

export function decodeTiffsInBackground(tiffs, { metadataManager, uiManager }) {
    const total = tiffs.length;
    if (total === 0) return;

    const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 6, total);
    let currentIndex = 0;
    let completedCount = 0;

    logger.log(`Iniciando pool de ${numWorkers} workers para ${total} TIFFs…`);

    const createWorker = () => {
        const worker = new Worker(new URL('../tiff-worker.js', import.meta.url), { type: 'module' });

        const processNext = () => {
            if (currentIndex >= total) {
                worker.terminate();
                return;
            }

            const { name, file } = tiffs[currentIndex++];
            file.arrayBuffer()
                .then(buffer => {
                    worker.postMessage({ name, buffer }, [buffer]);
                })
                .catch(err => {
                    logger.warn(`Error al leer ${name}:`, err);
                    completedCount++;
                    processNext();
                });
        };

        worker.onmessage = (e) => {
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
            } else {
                logger.warn(`TIFF fallido: ${name}`, error);
            }

            if (completedCount === total) {
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
