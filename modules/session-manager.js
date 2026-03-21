/**
 * session-manager
 * Restaura la sesión anterior: handle de directorio y vista del mapa.
 */
import { get } from 'idb-keyval';
import logger from './logger.js';

export async function tryRestoreSession(mapController) {
    let pendingDirectoryHandle = null;

    try {
        const savedHandle = await get('visor_historico_dir_handle');
        if (savedHandle) {
            logger.log('Sesión anterior detectada. Esperando permiso del usuario para restaurar...');
            pendingDirectoryHandle = savedHandle;

            const loadBtn = document.getElementById('loadDirBtn');
            if (loadBtn) {
                loadBtn.innerHTML = `<span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;" aria-hidden="true"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"></path><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"></polygon></svg>Recuperar Sesión</span>`;
                loadBtn.title = "Se ha detectado una carpeta cargada anteriormente. Haz clic para restaurar el acceso.";
                loadBtn.classList.add('btn-restore-highlight');
            }
        }
    } catch (e) {
        logger.warn('Error al intentar recuperar el directorio handle:', e);
    }

    try {
        const savedView = await get('map_view');
        if (savedView?.center && savedView?.zoom != null) {
            logger.log('Restaurando vista del mapa:', savedView);
            mapController.map.setView(savedView.center, savedView.zoom);
        }
    } catch (e) {
        logger.warn('Error al restaurar la vista del mapa:', e);
    }

    return pendingDirectoryHandle;
}
