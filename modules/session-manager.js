/**
 * session-manager
 * Restaura la sesión anterior: handle de directorio y vista del mapa.
 */
import { get } from 'idb-keyval';
import logger from './logger.js';

export async function tryRestoreSession(mapController) {
    let savedHandle = null;

    try {
        savedHandle = await get('visor_historico_dir_handle');
        if (savedHandle) {
            logger.log('Handle de directorio anterior detectado.');
        }
    } catch (e) {
        logger.warn('Error al recuperar el directorio handle:', e);
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

    return savedHandle;
}
