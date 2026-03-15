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

// --- STATE ---
let metadataManager;
let mapController;
let searchEngine;
let uiManager;
let filterManager;
let modalManager;
let statsService;
let exportService;

let currentImages = []; // Master list of filenames
let filteredImages = []; // Currently filtered/visible filenames
let selectedImagesList = []; // Array of selected filenames
let primarySelectedImage = null; // The main focused image

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
        filteredImages = galleryFiles;
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
        filterManager.applyFilters(); // Auto-refresh filters (e.g. if Type/Conservation changed)
        refreshUI(filename);
    });

    // Conectar callback de abrir original (doble clic)
    uiManager.setOpenOriginalCallback((filename) => {
        modalManager.openImageModal(filename);
    });

    // Listener global para clics en imágenes de popups y botones de acción (delegación)
    document.addEventListener('click', (e) => {
        const target = e.target;
        const filename = target.dataset.filename;
        
        if (filename && (target.classList.contains('popup-image') || target.classList.contains('popup-action-btn'))) {
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
    await tryRestoreSession();
}

async function tryRestoreSession() {
    try {
        const savedHandle = await get('visor_historico_dir_handle');
        if (savedHandle) {
            console.log('Sesión anterior detectada. Esperando permiso del usuario para restaurar...');
            // No podemos pedir permiso automáticamente sin gesto del usuario en algunos navegadores, 
            // pero podemos preparar el botón de carga para que use este handle.
            window.pendingDirectoryHandle = savedHandle;
            
            // Mostrar un aviso o cambiar el estilo del botón de carga
            const loadBtn = document.getElementById('loadDirBtn');
            if (loadBtn) {
                loadBtn.innerHTML = `<span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"></path><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"></polygon></svg>Recuperar Sesión</span>`;
                loadBtn.title = "Se ha detectado una carpeta cargada anteriormente. Haz clic para restaurar el acceso.";
                loadBtn.classList.add('btn-restore-highlight');
            }
        }
    } catch (e) {
        console.warn('Error al intentar recuperar el directorio handle:', e);
    }

    // Restaurar vista del mapa si existe
    try {
        const savedView = await get('map_view');
        if (savedView && savedView.center && savedView.zoom != null) {
            console.log('Restaurando vista del mapa:', savedView);
            mapController.map.setView(savedView.center, savedView.zoom);
        }
    } catch (e) {
        console.warn('Error al restaurar la vista del mapa:', e);
    }
}

function setupGlobalListeners() {
    // Load Button
    document.getElementById('loadDirBtn')?.addEventListener('click', async () => {
        if (window.pendingDirectoryHandle) {
            // Intentar usar el handle guardado
            const handle = window.pendingDirectoryHandle;
            
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

        if (window.searchTimeout) clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => filterManager.applyFilters(q), 300);
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

    // Expand Gallery
    document.getElementById('expandGalleryBtn')?.addEventListener('click', (e) => {
        const panel = document.querySelector('.gallery-panel');
        const btn = e.target.closest('button');
        const isExpanded = panel.classList.toggle('expanded');
        btn.classList.toggle('active', isExpanded);
        
        // Al expandir, ocultamos filtros por defecto para que las imágenes sean protagonistas
        if (isExpanded) {
            panel.classList.remove('show-filters');
            document.getElementById('toggleFiltersBtn')?.classList.remove('active');
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

    // Toggle Filters in Expanded Mode
    document.getElementById('toggleFiltersBtn')?.addEventListener('click', (e) => {
        const panel = document.querySelector('.gallery-panel');
        const btn = e.target.closest('button');
        const isShown = panel.classList.toggle('show-filters');
        btn.classList.toggle('active', isShown);
    });

    // Import/Export Metadata (Legacy buttons, routed through managers if needed or kept simple)
    document.getElementById('exportBtn')?.addEventListener('click', () => {
        metadataManager.exportToJSON();
        uiManager.showToast('Metadatos exportados', 'success');
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
            filterManager.applyFilters(); // refresh
        }
    });

    // Map Events
    mapController.onMarkerClick = (f) => selectImage(f);

    // Handle Marker Drag (Updates metadata and UI immediately)
    mapController.onMarkerDrag = (filename, newPos) => {
        metadataManager.updateMetadata(filename, { coordinates: { lat: newPos.lat, lng: newPos.lng } });

        // Update Details Panel if this is the primary selected image
        if (primarySelectedImage === filename) {
            const meta = metadataManager.getMetadata(filename);
            // Si hay selección múltiple lo maneja el renderMultipanel (o pasamos)
            if (selectedImagesList.length <= 1) {
                uiManager.renderMetadataPanel(filename, meta);
            }
        }

        uiManager.showToast('Ubicación actualizada (Arrastrar)', 'success');
    };

    mapController.onMapClick = (e) => {
        // Mode GeoFilter Radio
        if (filterManager.geographicFilter.activeMode === 'radius') {
            filterManager.geographicFilter.setActiveCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
            return; // No seleccionar imagen si estamos en modo radio
        }

        if (primarySelectedImage && e.originalEvent.ctrlKey) {
            const pos = { lat: e.latlng.lat, lng: e.latlng.lng };
            
            // Si hay uno solo, o queremos aplicar a todos los seleccionados:
            // Por lógica, arrastrar coordenadas a todos los seleccionados es útil (Lote)
            selectedImagesList.forEach(file => {
                metadataManager.updateMetadata(file, { coordinates: pos });
                mapController.addOrUpdateMarker(file, metadataManager.getMetadata(file));
                refreshUI(file);
            });

            // Si estamos filtrando por "Sin Coordenadas", al ponerle una, debe desaparecer de la lista.
            // Para eso reaplicamos filtros.
            filterManager.applyFilters();
            
            // Forzar repintado del panel
            if (selectedImagesList.length > 1) {
                uiManager.renderMultiMetadataPanel(selectedImagesList);
            } else {
                uiManager.renderMetadataPanel(primarySelectedImage);
            }

            uiManager.showToast(`Ubicación asignada a ${selectedImagesList.length} imagen(es)`, 'success');
        }
    };

    // Persistencia de la vista del mapa
    mapController.map.on('moveend', async () => {
        const center = mapController.getCenter();
        const zoom = mapController.getZoom();
        await set('map_view', { center, zoom });
    });

    mapController.map.on('zoomend', async () => {
        const center = mapController.getCenter();
        const zoom = mapController.getZoom();
        await set('map_view', { center, zoom });
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
        // Alt+E: Abrir Modal de Edición
        if (e.altKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            if (primarySelectedImage) {
                modalManager.openEditModal(primarySelectedImage);
            } else {
                uiManager.showToast('Selecciona una imagen primero', 'error');
            }
        }

        // FLECHAS: Navegación por galería (si el modal está abierto)
        if (modalManager.isImageModalOpen()) {
            if (e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation(); navigateGallery(1);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation(); navigateGallery(-1);
            }
        }

        // ESCAPE en Galería Expandida
        if (e.key === 'Escape') {
            const panel = document.querySelector('.gallery-panel');
            if (panel.classList.contains('expanded') && !modalManager.isImageModalOpen() && !modalManager.isEditModalOpen()) {
                panel.classList.remove('expanded');
                document.getElementById('expandGalleryBtn')?.classList.remove('active');
                panel.classList.remove('show-filters');
                document.getElementById('toggleFiltersBtn')?.classList.remove('active');
            }
        }
    });

    // Escuchar eventos de actualización en lote disparados desde UIManager
    window.addEventListener('metadataBatchUpdated', (e) => {
        // Al modificar muchos metadatos a la vez, debemos de regenerar filtros
        // porque puede que ahora pertenezcan a otros siglos, tipos, etc.
        filterManager.applyFilters();
    });
}


let allScannedFiles = []; // For statistics

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
                console.error('showDirectoryPicker API no disponible');
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
            window.pendingDirectoryHandle = null;
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

        currentImages = [];
        allScannedFiles = [];
        const pendingTiffs = [];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                allScannedFiles.push(entry.name);

                // Check for JSON Metadata
                if (entry.name.toLowerCase().endsWith('.json') &&
                    (entry.name.includes('coleccion-historia-metadata') || entry.name === 'metadata.json')) {
                    console.log('JSON de metadatos detectado:', entry.name);
                    const file = await entry.getFile();
                    const text = await file.text();
                    metadataManager.importFromJSON(text); // Import content automatically
                    uiManager.showToast('Metadatos importados automáticamente', 'success');
                }

                // Only images for gallery
                if (entry.name.match(/\.(jpg|jpeg|png|webp|tif|tiff)$/i)) {
                    currentImages.push(entry.name);

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
            statsService.setAllFiles(currentImages);
        }

        document.getElementById('totalCount').textContent = `${currentImages.length} catalogados`;
        filterManager.setImages(currentImages);
        filterManager.renderControllers();

        metadataManager.resumeSave(); // Re-enable and save once
        filterManager.applyFilters();

        // Actualizar marcadores del mapa con todas las imágenes que tienen coordenadas
        const metadataWithCoords = {};
        currentImages.forEach(filename => {
            const meta = metadataManager.getMetadata(filename);
            if (meta.coordinates && meta.coordinates.lat != null && meta.coordinates.lng != null) {
                metadataWithCoords[filename] = meta;
            }
        });
        mapController.updateMarkers(metadataWithCoords);

        uiManager.showToast(`Escaneados ${allScannedFiles.length} archivos | ${currentImages.length} catalogados`, 'success');

        // Background TIFF decoding (non-blocking)
        if (pendingTiffs.length > 0 && typeof UTIF !== 'undefined') {
            decodeTiffsInBackground(pendingTiffs);
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Selección de directorio cancelada por el usuario');
        } else if (err.name === 'NotAllowedError') {
            uiManager.showToast('Permiso denegado para acceder al directorio', 'error');
            console.error('NotAllowedError:', err);
        } else if (err.name === 'SecurityError') {
            uiManager.showToast('Error de seguridad al acceder al directorio', 'error');
            console.error('SecurityError:', err);
        } else {
            uiManager.showToast('Error al cargar el directorio', 'error');
            console.error('Error al cargar directorio:', err);
        }
    }
}

/**
 * Decodifica los TIFF pendientes en un Web Worker (hilo separado).
 * Vite soporta workers como módulos ES nativamente.
 */
function decodeTiffsInBackground(tiffs) {
    const worker = new Worker(new URL('./tiff-worker.js', import.meta.url), { type: 'module' });
    let i = 0;
    const total = tiffs.length;
    console.log(`Iniciando decodificación de ${total} TIFF en Web Worker…`);

    worker.onmessage = function (e) {
        const { name, blob, w, h, ok, error } = e.data;

        if (ok) {
            // Memory Cleanup: Revoke old placeholder if it was a blob
            const meta = metadataManager.getMetadata(name);
            if (meta._previewUrl && meta._previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(meta._previewUrl);
            }

            const previewUrl = URL.createObjectURL(blob);
            metadataManager.setVolatileData(name, { _previewUrl: previewUrl, _isProcessing: false });

            // Update thumbnail in DOM
            const card = document.querySelector(`[data-filename="${CSS.escape(name)}"]`);
            if (card) {
                const imgBox = card.querySelector('.card-image-box');
                if (imgBox) {
                    imgBox.innerHTML = `<img src="${previewUrl}" class="card-img" loading="lazy" alt="Preview">`;
                }
            }
            console.log(`TIFF ${i}/${total}: ${name} (${w}×${h})`);
        } else {
            console.warn(`TIFF fallido: ${name}`, error);
        }

        // Send next TIFF to worker
        sendNext();
    };

    worker.onerror = function (err) {
        console.error('Error en tiff-worker:', err);
        sendNext();
    };

    function sendNext() {
        if (i >= total) {
            worker.terminate();
            uiManager.showToast(`${total} TIFF procesados`, 'success');
            console.log('Decodificación TIFF completada.');
            return;
        }

        const { name, file } = tiffs[i++];
        file.arrayBuffer().then(buffer => {
            worker.postMessage({ name, buffer }, [buffer]); // Transfer buffer (zero-copy)
        }).catch(err => {
            console.warn(`No se pudo leer: ${name}`, err);
            sendNext();
        });
    }

    // Start after a brief delay to let the gallery finish rendering
    setTimeout(sendNext, 300);
}

// MANEJADOR PRINCIPAL DE SELECCIÓN (Single y Lote)
function handleSelectionChange(primaryFile, allSelected) {
    primarySelectedImage = primaryFile;
    selectedImagesList = allSelected || [];

    // Si vacío
    if (!primarySelectedImage || selectedImagesList.length === 0) {
        uiManager.elements.metadataContent.innerHTML = '<div style="padding:15px; text-align:center; color:#9ca3af;">Selecciona una imagen para ver sus detalles</div>';
        return;
    }

    // Single vs Lote
    if (selectedImagesList.length === 1) {
        uiManager.renderMetadataPanel(primarySelectedImage);

        // Mapa Focus
        const meta = metadataManager.getMetadata(primarySelectedImage);
        const hasCoords = meta.coordinates && typeof meta.coordinates.lat === 'number';
        if (hasCoords) {
            mapController.focusMarker(primarySelectedImage);
        } else {
            uiManager.showToast('Imagen sin ubicación. Ctrl + Clic en el mapa para situarla', 'normal');
            mapController.map.panTo([40.4168, -3.7038]);
        }
    } else {
        // Múltiples seleccionados
        uiManager.renderMultiMetadataPanel(selectedImagesList);
        uiManager.showToast(`${selectedImagesList.length} elementos seleccionados para edición en lote`, 'success');
    }
}

// Wrapper legacy para marcadores (devuelven string simple)
function selectImage(filename) {
    uiManager.updateSelection([filename]);
    // updateSelection dispara el callback handleSelectionChange internamente
}

function refreshUI(filename, fieldAffected = null) {
    // 1. Siempre actualizar el panel de detalles si es la seleccionada, O si estamos en lote
    if (selectedImagesList.includes(filename)) {
        if (selectedImagesList.length > 1) {
            uiManager.renderMultiMetadataPanel(selectedImagesList);
        } else {
            uiManager.renderMetadataPanel(primarySelectedImage);
        }
    }

    // 2. Decisión inteligente: ¿Necesitamos re-filtrar todo o solo actualizar la tarjeta?
    const filterFields = ['centuries', 'type', 'conservationStatus', 'coordinates.lat', 'coordinates.lng'];

    // Si no sabemos qué cambió, o cambió un campo de filtro, re-filtramos todo
    if (!fieldAffected || filterFields.includes(fieldAffected)) {
        const currentSearch = document.getElementById('searchInput').value;
        filterManager.applyFilters(currentSearch, true); // forceRefresh = true para actualizar contadores
    } else {
        // Si es un campo puramente informativo (Asunto, Autor, Notas...) 
        // solo actualizamos la miniatura visualmente para no perder el scroll ni el foco
        uiManager.updateGalleryItem(filename);
    }
}

function navigateGallery(direction) {
    if (!filteredImages || filteredImages.length === 0) return;
    
    // El modal manager debe rastrear qué archivo tiene abierto ahora mismo
    const currentFile = modalManager.currentImageFile;
    if (!currentFile) return;

    let idx = filteredImages.indexOf(currentFile);
    if (idx === -1) {
        // Si no está en la lista filtrada actual (ej. acabamos de filtrar y ya no cumple)
        // buscamos el más próximo o simplemente cerramos/no hacemos nada.
        return;
    }

    idx += direction;
    // Bucle circular
    if (idx < 0) idx = filteredImages.length - 1;
    if (idx >= filteredImages.length) idx = 0;

    const nextFile = filteredImages[idx];
    modalManager.openImageModal(nextFile);
    
    // Opcional: sincronizar selección en la parrilla para que el scroll siga al modal
    uiManager.updateSelection([nextFile]);
}

// Configurar PWA Service Worker
const updateSW = registerSW({
    onNeedRefresh() {
        console.log("Nueva versión de la app disponible. Actualiza para ver los cambios.");
    },
    onOfflineReady() {
        console.log("Visor Histórico listo para uso offline.");
    },
});

document.addEventListener('DOMContentLoaded', init);
