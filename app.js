import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import * as UTIF from 'utif';
import { registerSW } from 'virtual:pwa-register';
import { get, set } from 'idb-keyval';

import MetadataManager from './metadata-manager.js';
import MapController from './map-controller.js';
import SearchEngine from './search-engine.js';

import UIManager from './modules/UIManager.js';
import FilterManager from './modules/FilterManager.js';
import ModalManager from './modules/ModalManager.js';
import StatisticsService from './modules/services/StatisticsService.js';
import ExportService from './modules/services/ExportService.js';
import logger from './modules/logger.js';
import { decodeTiffsInBackground } from './modules/tiff-decoder.js';
import { tryRestoreSession } from './modules/session-manager.js';

// --- STATE ---
let metadataManager;
let mapController;
let searchEngine;
let uiManager;
let filterManager;
let modalManager;
let statsService;
let exportService;

const state = {
    currentImages: [],
    filteredImages: [],
    selectedImagesList: [],
    primarySelectedImage: null,
    pendingDirectoryHandle: null,
    allScannedFiles: [],
};
let searchTimeout = null;

// --- INITIALIZATION ---
async function init() {
    metadataManager = new MetadataManager();
    await metadataManager.init(); // ¡Ahora es asíncrono y usa IndexedDB!
    searchEngine = new SearchEngine(metadataManager);

    // Map controller expects container ID
    mapController = new MapController('map');

    uiManager = new UIManager(metadataManager, handleSelectionChange);
    statsService = new StatisticsService(metadataManager);
    exportService = new ExportService(metadataManager);

    // Filter logic has been split:
    // galleryFiles -> Matches ALL filters (including "Sin Coordenadas")
    // mapFiles -> Matches context filters (Century, etc.) but ALWAYS includes valid coordinates (ignores "Sin Coordenadas" restriction)
    filterManager = new FilterManager(metadataManager, searchEngine, (galleryFiles, mapFiles) => {
        // 1. Update Gallery
        state.filteredImages = galleryFiles;
        uiManager.renderGallery(galleryFiles);

        // 2. Update Map Markers
        // We use mapFiles which follows Reference Logic.
        // We do NOT use filterMarkers here because updateMarkers will clear and add only the new set.

        const visibleMeta = {};
        mapFiles.forEach(f => {
            const m = metadataManager.getMetadata(f);
            // Harden check: Ensure lat/lng are valid numbers
            if (m.coordinates && typeof m.coordinates.lat === 'number' && typeof m.coordinates.lng === 'number') {
                visibleMeta[f] = m;
            }
        });
        mapController.updateMarkers(visibleMeta);

        // 3. Update Geographic Filter Graphics
        if (filterManager.geographicFilter.activeMode === 'radius') {
            mapController.drawRadius(filterManager.geographicFilter.filterCoords, filterManager.geographicFilter.radiusMeters);
        } else if (filterManager.geographicFilter.activeMode === 'polygon') {
            const poly = filterManager.geographicFilter.districts[filterManager.geographicFilter.activePolygonName];
            mapController.drawPolygon(poly);
        } else {
            mapController.clearGeoFilter();
        }
    });

    modalManager = new ModalManager(metadataManager, uiManager, statsService, exportService, (filename, updates) => {
        metadataManager.updateMetadata(filename, updates);
        filterManager.applyFilters(null); // Auto-refresh filters preserving active search
        refreshUI(filename);
    });

    // Conectar getters de listas de imágenes en modalManager (para exportación filtrada)
    modalManager.getFilteredImages = () => state.filteredImages;
    modalManager.getAllImages = () => state.currentImages;

    // Conectar callback de abrir original (doble clic)
    uiManager.setOpenOriginalCallback((filename) => {
        modalManager.openImageModal(filename);
    });

    // Listener global para clics en imágenes de popups y botones de acción (delegación)
    document.addEventListener('click', (e) => {
        const target = e.target;
        const filename = target.dataset.filename;

        if (filename && target.classList.contains('popup-image')) {
            modalManager.openImageModal(filename);
        }
    });

    // Conectar callback de edición del panel de detalles
    uiManager.setMetadataUpdateCallback((filename, updates) => {
        metadataManager.updateMetadata(filename, updates);

        // Si se actualizaron coordenadas, actualizar marcador en el mapa
        if (updates.coordinates) {
            const meta = metadataManager.getMetadata(filename);
            mapController.addOrUpdateMarker(filename, meta);
        }

        // Obtener el nombre del campo afectado para optimizar el refresco
        const firstField = Object.keys(updates)[0];
        refreshUI(filename, firstField);

        // No mostrar toast en cada pequeña edición de campo para no saturar
        // uiManager.showToast('Cambios guardados', 'success');
    });

    setupGlobalListeners();

    // Initial State: Empty until load
    uiManager.renderGallery([]);

    // Intentar restaurar sesión anterior de forma transparente
    state.pendingDirectoryHandle = await tryRestoreSession(mapController);
}

function setupGlobalListeners() {
    // Load Button
    document.getElementById('loadDirBtn')?.addEventListener('click', async () => {
        if (state.pendingDirectoryHandle) {
            // Intentar usar el handle guardado
            const handle = state.pendingDirectoryHandle;

            // Verificar si tenemos permiso
            const options = { mode: 'read' };
            if (await handle.queryPermission(options) === 'granted') {
                loadImagesFromDirectory(handle);
            } else {
                // Pedir permiso explícitamente (cuenta como gesto del usuario)
                if (await handle.requestPermission(options) === 'granted') {
                    loadImagesFromDirectory(handle);
                } else {
                    // Si el usuario deniega el permiso del antiguo, abrir selector nuevo
                    loadImagesFromDirectory();
                }
            }
        } else {
            loadImagesFromDirectory();
        }
    });

    // Search Input
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        document.getElementById('clearSearchBtn').classList.toggle('hidden', !q);

        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => filterManager.applyFilters(q), 300);
    });

    document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.target.value = '';
            filterManager.applyFilters('');
            document.getElementById('clearSearchBtn').classList.add('hidden');
            e.target.blur();
        }
    });

    document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        filterManager.applyFilters('');
        document.getElementById('clearSearchBtn').classList.add('hidden');
    });

    // View Switching (Grid/List)
    document.getElementById('viewListBtn')?.addEventListener('click', () => {
        const grid = document.getElementById('galleryGrid');
        // Eliminar todas las clases grid-cols-* y establecer lista
        grid.className = 'gallery-grid list-view';
        document.getElementById('viewListBtn').classList.add('active');
        document.getElementById('viewGridBtn').classList.remove('active');
        // Ocultar controles de columna en vista de lista
        document.getElementById('columnControls')?.classList.add('hidden');
    });

    document.getElementById('viewGridBtn')?.addEventListener('click', () => {
        const grid = document.getElementById('galleryGrid');
        // Restaurar vista de cuadrícula con 2 columnas por defecto
        grid.className = 'gallery-grid grid-cols-2';
        document.getElementById('viewGridBtn').classList.add('active');
        document.getElementById('viewListBtn').classList.remove('active');
        // Mostrar controles de columna en vista de cuadrícula
        document.getElementById('columnControls')?.classList.remove('hidden');
        // Marcar botón de 2 columnas como activo
        document.querySelectorAll('[data-cols]').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-cols="2"]')?.classList.add('active');
    });

    // Column switching
    document.querySelectorAll('[data-cols]').forEach(btn => {
        btn.addEventListener('click', e => {
            const cols = e.target.closest('button').dataset.cols;
            const grid = document.getElementById('galleryGrid');
            grid.className = `gallery-grid grid-cols-${cols}`;
            // Reset active
            document.querySelectorAll('[data-cols]').forEach(b => b.classList.remove('active'));
            e.target.closest('button').classList.add('active');
        });
    });

    // Toggle Filters visibility (atomic show/hide of entire filter block)
    document.getElementById('toggleFiltersBtn')?.addEventListener('click', (e) => {
        const filtersBlock = document.getElementById('filtersCollapsible');
        const btn = e.target.closest('button');
        if (!filtersBlock) return;

        const isHidden = filtersBlock.classList.toggle('collapsed');
        btn.classList.toggle('active', !isHidden);
    });

    // Expand Gallery
    document.getElementById('expandGalleryBtn')?.addEventListener('click', (e) => {
        const panel = document.querySelector('.gallery-panel');
        const btn = e.target.closest('button');
        const isExpanded = panel.classList.toggle('expanded');
        btn.classList.toggle('active', isExpanded);

        // Al expandir, ocultamos filtros por defecto para que las imágenes sean protagonistas
        if (isExpanded) {
            const filtersBlock = document.getElementById('filtersCollapsible');
            const filterBtn = document.getElementById('toggleFiltersBtn');
            if (filtersBlock) filtersBlock.classList.add('collapsed');
            if (filterBtn) filterBtn.classList.remove('active');
        }

        // Ajustar columnas de la galería si está expandida
        const grid = document.getElementById('galleryGrid');
        if (isExpanded) {
            if (grid.classList.contains('grid-cols-1') || grid.classList.contains('grid-cols-2')) {
                grid.className = 'gallery-grid grid-cols-4';
                document.querySelectorAll('[data-cols]').forEach(b => b.classList.remove('active'));
                document.querySelector('[data-cols="4"]')?.classList.add('active');
            }
        }
    });

    // Import/Export Metadata (Legacy buttons, routed through managers if needed or kept simple)
    document.getElementById('exportBtn')?.addEventListener('click', () => {
        const filtered = state.filteredImages;
        const total = state.currentImages;
        if (filtered.length > 0 && filtered.length < total.length) {
            const choice = confirm(
                `¿Qué deseas exportar?\n\nAceptar → Exportar filtro actual (${filtered.length} imágenes)\nCancelar → Exportar todo (${total.length} imágenes)`
            );
            if (choice) {
                metadataManager.exportToJSON(filtered);
                uiManager.showToast(`Metadatos exportados (${filtered.length} imágenes)`, 'success');
            } else {
                metadataManager.exportToJSON();
                uiManager.showToast('Metadatos exportados (colección completa)', 'success');
            }
        } else {
            metadataManager.exportToJSON();
            uiManager.showToast('Metadatos exportados', 'success');
        }
    });

    document.getElementById('importBtn')?.addEventListener('click', () => {
        document.getElementById('importInput').click();
    });

    document.getElementById('importInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        if (metadataManager.importFromJSON(text)) {
            uiManager.showToast('Metadatos importados', 'success');
            // Refresh logic?
        } else {
            uiManager.showToast('Error al importar', 'error');
        }
        e.target.value = '';
    });

    // Optimization
    document.getElementById('optimizeBtn')?.addEventListener('click', () => {
        if (confirm('¿Optimizar metadatos?')) {
            const stats = metadataManager.optimizeMetadata();
            uiManager.showToast(`Optimizado: ${stats.cleaned} entradas.`, 'success');
            filterManager.applyFilters(null); // refresh preserving active search
        }
    });

    // Map Events
    mapController.onMarkerClick = (f) => selectImage(f);

    // Handle Marker Drag (Updates metadata and UI immediately)
    mapController.onMarkerDrag = (filename, newPos) => {
        metadataManager.updateMetadata(filename, { coordinates: { lat: newPos.lat, lng: newPos.lng } });

        // Update Details Panel if this is the primary selected image
        if (state.primarySelectedImage === filename) {
            const meta = metadataManager.getMetadata(filename);
            // Si hay selección múltiple lo maneja el renderMultipanel (o pasamos)
            if (state.selectedImagesList.length <= 1) {
                uiManager.renderMetadataPanel(filename, meta);
            }
        }

        filterManager.applyFilters(null); // Re-aplica sin borrar la búsqueda activa
        uiManager.showToast('Ubicación actualizada (Arrastrar)', 'success');
    };

    mapController.onMapClick = (e) => {
        // Mode GeoFilter Radio
        if (filterManager.geographicFilter.activeMode === 'radius') {
            filterManager.geographicFilter.setActiveCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
            return; // No seleccionar imagen si estamos en modo radio
        }

        if (state.primarySelectedImage && e.originalEvent.ctrlKey) {
            const pos = { lat: e.latlng.lat, lng: e.latlng.lng };

            // Si hay uno solo, o queremos aplicar a todos los seleccionados:
            // Por lógica, arrastrar coordenadas a todos los seleccionados es útil (Lote)
            state.selectedImagesList.forEach(file => {
                metadataManager.updateMetadata(file, { coordinates: pos });
                mapController.addOrUpdateMarker(file, metadataManager.getMetadata(file));
                refreshUI(file);
            });

            // Si estamos filtrando por "Sin Coordenadas", al ponerle una, debe desaparecer de la lista.
            // Para eso reaplicamos filtros.
            filterManager.applyFilters(null);

            // Forzar repintado del panel
            if (state.selectedImagesList.length > 1) {
                uiManager.renderMultiMetadataPanel(state.selectedImagesList);
            } else {
                uiManager.renderMetadataPanel(state.primarySelectedImage);
            }

            uiManager.showToast(`Ubicación asignada a ${state.selectedImagesList.length} imagen(es)`, 'success');
        }
    };

    // Persistencia de la vista del mapa (debounced, moveend cubre también zoomend)
    let mapViewSaveTimeout = null;
    mapController.map.on('moveend', () => {
        if (mapViewSaveTimeout) clearTimeout(mapViewSaveTimeout);
        mapViewSaveTimeout = setTimeout(async () => {
            const center = mapController.getCenter();
            const zoom = mapController.getZoom();
            await set('map_view', { center, zoom });
        }, 500);
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === '/') {
            const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (tag !== 'input' && tag !== 'textarea') {
                e.preventDefault();
                document.getElementById('searchInput').focus();
            }
        }
        // Ctrl+G: Explorar/Guardar (Exportar JSON)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            metadataManager.saveToStorage();
            uiManager.showToast('Cambios guardados en navegador (Ctrl+G)', 'success');
        }
        // Ctrl+E: Seleccionar todas las imágenes visibles
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
            const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const anyModalOpen = modalManager.isImageModalOpen() || modalManager.isEditModalOpen();
            if (!anyModalOpen && tag !== 'input' && tag !== 'textarea') {
                e.preventDefault();
                if (state.filteredImages.length > 0) {
                    uiManager.updateSelection(state.filteredImages);
                    uiManager.showToast(`Seleccionadas ${state.filteredImages.length} imágenes`, 'success');
                }
            }
        }

        // Alt+E: Abrir Modal de Edición
        if (e.altKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            if (state.primarySelectedImage) {
                modalManager.openEditModal(state.primarySelectedImage);
            } else {
                uiManager.showToast('Selecciona una imagen primero', 'error');
            }
        }

        // Alt + G: Expandir Galería
        if (e.altKey && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            document.getElementById('expandGalleryBtn')?.click();
        }

        // FLECHAS: Navegación por galería (si el modal está abierto)
        if (modalManager.isImageModalOpen()) {
            if (e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation(); navigateGallery(1);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation(); navigateGallery(-1);
            }
        }

        // ESCAPE: quitar selección múltiple o colapsar galería expandida
        if (e.key === 'Escape') {
            if (uiManager.selectedImages.size > 1 && !modalManager.isImageModalOpen() && !modalManager.isEditModalOpen()) {
                uiManager.clearSelection();
                uiManager.showToast('Selección eliminada', 'normal');
                return;
            }
            const panel = document.querySelector('.gallery-panel');
            if (panel.classList.contains('expanded') && !modalManager.isImageModalOpen() && !modalManager.isEditModalOpen()) {
                panel.classList.remove('expanded');
                document.getElementById('expandGalleryBtn')?.classList.remove('active');
                // Restaurar filtros visibles al salir del modo expandido
                const filtersBlock = document.getElementById('filtersCollapsible');
                const filterBtn = document.getElementById('toggleFiltersBtn');
                if (filtersBlock) filtersBlock.classList.remove('collapsed');
                if (filterBtn) filterBtn.classList.add('active');
            }
        }
    });

    // Escuchar eventos de actualización en lote disparados desde UIManager
    window.addEventListener('metadataBatchUpdated', (e) => {
        // Re-filtrar SIN destruir el DOM de los filtros (preserva estado de selección)
        const currentSearch = document.getElementById('searchInput').value;
        filterManager.applyFilters(currentSearch, false);
        // Solo actualizar los contadores numéricos de los chips
        filterManager.updateCounts();
    });
}


async function loadImagesFromDirectory(existingHandle = null) {
    try {
        let dirHandle;

        if (existingHandle) {
            dirHandle = existingHandle;
        } else {
            // Verificar compatibilidad con la API
            if (!window.showDirectoryPicker) {
                alert('Tu navegador no soporta la selección de directorios.\n\n' +
                    'Navegadores compatibles:\n' +
                    '• Google Chrome/Edge (versión 86+)\n' +
                    '• Opera (versión 72+)\n\n' +
                    'Firefox no soporta esta API actualmente.');
                logger.error('showDirectoryPicker API no disponible');
                return;
            }
            dirHandle = await window.showDirectoryPicker();
            // Guardar para futuras sesiones
            await set('visor_historico_dir_handle', dirHandle);
        }

        uiManager.showToast('Cargando directorio...', 'normal');

        // Restaurar estado visual del botón si estaba en modo recuperar
        const loadBtn = document.getElementById('loadDirBtn');
        if (loadBtn) {
            loadBtn.innerHTML = `<span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:10px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>Cargar</span>`;
            loadBtn.classList.remove('btn-restore-highlight');
            state.pendingDirectoryHandle = null;
        }

        metadataManager.suspendSave(); // Avoid 1000+ writes to localStorage

        // MEMORY CLEANUP: revoke old object URLs before loading new ones
        const allMetaKeys = Object.keys(metadataManager.getAllMetadata());
        allMetaKeys.forEach(key => {
            const m = metadataManager.getMetadata(key);
            if (m._previewUrl && m._previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(m._previewUrl);
                metadataManager.setVolatileData(key, { _previewUrl: null });
            }
        });

        state.currentImages = [];
        state.allScannedFiles = [];
        const pendingTiffs = [];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                state.allScannedFiles.push(entry.name);

                // Check for JSON Metadata
                if (entry.name.toLowerCase().endsWith('.json') &&
                    (entry.name.includes('coleccion-historia-metadata') || entry.name === 'metadata.json')) {
                    logger.log('JSON de metadatos detectado:', entry.name);
                    const file = await entry.getFile();
                    const text = await file.text();
                    metadataManager.importFromJSON(text); // Import content automatically
                    uiManager.showToast('Metadatos importados automáticamente', 'success');
                }

                // Only images for gallery
                if (entry.name.match(/\.(jpg|jpeg|png|webp|tif|tiff)$/i)) {
                    state.currentImages.push(entry.name);

                    const file = await entry.getFile();
                    const isTiff = /\.(tif|tiff)$/i.test(entry.name);

                    if (isTiff) {
                        // Defer TIFF decoding — store File for background processing
                        pendingTiffs.push({ name: entry.name, file });
                        metadataManager.setVolatileData(entry.name, {
                            _isProcessing: true,
                            _fileSize: file.size
                        });
                    } else {
                        const previewUrl = URL.createObjectURL(file);
                        metadataManager.setVolatileData(entry.name, {
                            _previewUrl: previewUrl,
                            _fileSize: file.size
                        });
                    }
                }
            }
        }

        // Pass only images to stats service for consistency
        if (statsService.setAllFiles) {
            statsService.setAllFiles(state.currentImages);
        }

        document.getElementById('totalCount').innerHTML = `<b>${state.currentImages.length}</b> catalogados`;
        filterManager.setImages(state.currentImages);
        filterManager.renderControllers();

        metadataManager.resumeSave(); // Re-enable and save once
        filterManager.applyFilters();

        // Actualizar marcadores del mapa con todas las imágenes que tienen coordenadas
        const metadataWithCoords = {};
        state.currentImages.forEach(filename => {
            const meta = metadataManager.getMetadata(filename);
            if (meta.coordinates && meta.coordinates.lat != null && meta.coordinates.lng != null) {
                metadataWithCoords[filename] = meta;
            }
        });
        mapController.updateMarkers(metadataWithCoords);

        uiManager.showToast(`Escaneados ${state.allScannedFiles.length} archivos | ${state.currentImages.length} catalogados`, 'success');

        // Background TIFF decoding (non-blocking)
        if (pendingTiffs.length > 0) {
            decodeTiffsInBackground(pendingTiffs, { metadataManager, uiManager });
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            logger.log('Selección de directorio cancelada por el usuario');
        } else if (err.name === 'NotAllowedError') {
            uiManager.showToast('Permiso denegado para acceder al directorio', 'error');
            logger.error('NotAllowedError:', err);
        } else if (err.name === 'SecurityError') {
            uiManager.showToast('Error de seguridad al acceder al directorio', 'error');
            logger.error('SecurityError:', err);
        } else {
            uiManager.showToast('Error al cargar el directorio', 'error');
            logger.error('Error al cargar directorio:', err);
        }
    }
}


// MANEJADOR PRINCIPAL DE SELECCIÓN (Single y Lote)
function handleSelectionChange(primaryFile, allSelected) {
    state.primarySelectedImage = primaryFile;
    state.selectedImagesList = allSelected || [];

    // Si vacío
    if (!state.primarySelectedImage || state.selectedImagesList.length === 0) {
        uiManager.elements.metadataContent.innerHTML = '<div style="padding:15px; text-align:center; color:#9ca3af;">Selecciona una imagen para ver sus detalles</div>';
        return;
    }

    // Single vs Lote
    if (state.selectedImagesList.length === 1) {
        uiManager.renderMetadataPanel(state.primarySelectedImage);

        // Mapa Focus
        const meta = metadataManager.getMetadata(state.primarySelectedImage);
        const hasCoords = meta.coordinates && typeof meta.coordinates.lat === 'number';
        if (hasCoords) {
            mapController.focusMarker(state.primarySelectedImage);
        } else {
            uiManager.showToast('Imagen sin ubicación. Ctrl + Clic en el mapa para situarla', 'normal');
        }
    } else {
        // Múltiples seleccionados
        uiManager.renderMultiMetadataPanel(state.selectedImagesList);
        uiManager.showToast(`${state.selectedImagesList.length} elementos seleccionados para edición en lote`, 'success');
    }
}

// Wrapper legacy para marcadores (devuelven string simple)
function selectImage(filename) {
    // Si ya está seleccionado en una selección múltiple, solo hacemos foco en el mapa
    if (state.selectedImagesList.length > 1 && state.selectedImagesList.includes(filename)) {
        mapController.focusMarker(filename);
        return;
    }

    // Si hay una selección múltiple pero pulsamos un marcador de FUERA de ella,
    // por defecto respetamos la selección y solo hacemos foco.
    // (Previene pérdida accidental de selección al navegar por el mapa)
    if (state.selectedImagesList.length > 1) {
        mapController.focusMarker(filename);
        uiManager.showToast('Filtro: Selección mantenida. Pulsa en la galería para cambiarla.', 'normal');
        return;
    }

    uiManager.updateSelection([filename]);
    // updateSelection dispara el callback handleSelectionChange internamente
}

function refreshUI(filename, fieldAffected = null) {
    // 1. Siempre actualizar el panel de detalles si es la seleccionada, O si estamos en lote
    if (state.selectedImagesList.includes(filename)) {
        if (state.selectedImagesList.length > 1) {
            uiManager.renderMultiMetadataPanel(state.selectedImagesList);
        } else {
            uiManager.renderMetadataPanel(state.primarySelectedImage);
        }
    }

    // 2. Decisión inteligente: ¿Necesitamos re-filtrar todo (destructivo) o solo actualizar la tarjeta (ligero)?
    // Campos que SI afectan a los filtros y requieren re-filtrar
    const filterFields = ['centuries', 'reign', 'type', 'conservationStatus', 'coordinates.lat', 'coordinates.lng'];

    if (!fieldAffected || filterFields.some(f => fieldAffected.startsWith(f))) {
        const currentSearch = document.getElementById('searchInput').value;
        // Re-filtrar sin destruir el DOM de los filtros (forceRefresh=false)
        // Solo actualizamos los contadores de los chips
        filterManager.applyFilters(currentSearch, false);
        filterManager.updateCounts();
    } else {
        // ACTUALIZACIÓN PARCIAL: Solo el ítem de la galería. NO se pierde el scroll ni el foco.
        uiManager.updateGalleryItem(filename);
    }
}

function navigateGallery(direction) {
    if (!state.filteredImages || state.filteredImages.length === 0) return;

    // El modal manager debe rastrear qué archivo tiene abierto ahora mismo
    const currentFile = modalManager.currentImageFile;
    if (!currentFile) return;

    let idx = state.filteredImages.indexOf(currentFile);
    if (idx === -1) {
        // Si no está en la lista filtrada actual (ej. acabamos de filtrar y ya no cumple)
        // buscamos el más próximo o simplemente cerramos/no hacemos nada.
        return;
    }

    idx += direction;
    // Bucle circular
    if (idx < 0) idx = state.filteredImages.length - 1;
    if (idx >= state.filteredImages.length) idx = 0;

    const nextFile = state.filteredImages[idx];
    modalManager.openImageModal(nextFile);

    // Opcional: sincronizar selección en la parrilla para que el scroll siga al modal
    uiManager.updateSelection([nextFile]);
}

// Configurar PWA Service Worker
const updateSW = registerSW({
    onNeedRefresh() {
        logger.log("Nueva versión de la app disponible. Actualiza para ver los cambios.");
    },
    onOfflineReady() {
        logger.log("Visor Histórico listo para uso offline.");
    },
});

document.addEventListener('DOMContentLoaded', init);
