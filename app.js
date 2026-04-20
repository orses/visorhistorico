import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import * as UTIF from 'utif';
import { registerSW } from 'virtual:pwa-register';
import { get, set, clear as clearIDB } from 'idb-keyval';

import MetadataManager from './metadata-manager.js';
import MapController from './map-controller.js';
import SearchEngine from './search-engine.js';

import UIManager from './modules/UIManager.js';
import FilterManager from './modules/FilterManager.js';
import ModalManager from './modules/ModalManager.js';
import StatisticsService from './modules/services/StatisticsService.js';
import ExportService from './modules/services/ExportService.js';
import logger from './modules/logger.js';
import { decodeTiffsInBackground, decodeSingleTiff } from './modules/tiff-decoder.js';
import { tryRestoreSession } from './modules/session-manager.js';
import SearchWorkerClient from './modules/SearchWorkerClient.js';

// --- STATE ---
let metadataManager;
let mapController;
let searchEngine;
let searchWorkerClient;
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
    allScannedFiles: [],
    tiffFileMap: new Map(), // filename → File (for on-demand decode)
    dirHandle: null,        // FileSystemDirectoryHandle activo (para guardar notas)
};
let searchTimeout = null;
let noteMode = false;

// --- INITIALIZATION ---
async function init() {
    metadataManager = new MetadataManager();
    await metadataManager.init(); // ¡Ahora es asíncrono y usa IndexedDB!
    searchEngine = new SearchEngine(metadataManager);
    searchWorkerClient = new SearchWorkerClient();

    // Map controller expects container ID
    mapController = new MapController('map');

    // Load saved map notes
    const savedNotes = await get('map_notes') || [];
    mapController.loadNotes(savedNotes);

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
            // Harden check: Ensure lat/lng are valid numbers and coordinates are user-placed
            if (m.coordinates && typeof m.coordinates.lat === 'number' && typeof m.coordinates.lng === 'number' && m._userCoords === true) {
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

    // Conectar search worker al filter manager
    filterManager.searchWorkerClient = searchWorkerClient;

    modalManager = new ModalManager(metadataManager, uiManager, statsService, exportService, (filename, updates) => {
        metadataManager.updateMetadata(filename, updates);
        filterManager.applyFilters(null); // Auto-refresh filters preserving active search
        refreshUI(filename);
    });

    // Conectar getters de listas de imágenes en modalManager (para exportación filtrada)
    modalManager.getFilteredImages  = () => state.filteredImages;
    modalManager.getAllImages        = () => state.currentImages;
    modalManager.getSelectedImages  = () => state.selectedImagesList;

    // Conectar comparador de épocas
    uiManager.onCompare = (a, b) => modalManager.openComparatorModal(a, b);

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
        // Mark coordinates set via the panel as user-placed
        if (updates.coordinates) {
            updates._userCoords = true;
        }
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

    // Auto-restaurar sesión si el permiso ya está concedido
    const savedHandle = await tryRestoreSession(mapController);
    if (savedHandle) {
        const perm = await savedHandle.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
            loadImagesFromDirectory(savedHandle);
        }
        // Si no hay permiso, el usuario pulsa "Cargar" para elegir carpeta
    }
}

function setupGlobalListeners() {
    // Load Button — siempre carga limpia desde el selector de carpeta
    document.getElementById('loadDirBtn')?.addEventListener('click', () => {
        loadImagesFromDirectory();
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

    // Restablecer todos los filtros (botón de toolbar + botón inline en el panel)
    const clearAllFiltersHandler = () => {
        if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; }
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').classList.add('hidden');
        filterManager.resetAll();
    };
    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearAllFiltersHandler);
    document.getElementById('clearFiltersInlineBtn')?.addEventListener('click', clearAllFiltersHandler);

    // Toggle panel de metadatos — botón dentro del panel + botón reabrir en el mapa
    const _toggleDetailsPanel = (forceHide) => {
        const panel = document.getElementById('metadataPanel');
        const mapEl = document.querySelector('.map-panel');
        const isHidden = forceHide !== undefined ? forceHide : !panel.classList.contains('panel-hidden');
        panel.classList.toggle('panel-hidden', isHidden);
        if (mapEl) mapEl.classList.toggle('panel-hidden-active', isHidden);
        // Leaflet necesita recalcular su tamaño tras el cambio de layout
        setTimeout(() => mapController.map.invalidateSize(), 50);
    };
    document.getElementById('toggleDetailsPanelBtn')?.addEventListener('click', () => _toggleDetailsPanel());
    document.getElementById('reopenDetailsPanelBtn')?.addEventListener('click', () => _toggleDetailsPanel(false));

    // Toggle panel de galería — botón dentro del panel + botón reabrir en el mapa
    const _toggleGalleryPanel = (forceHide) => {
        const panel = document.querySelector('.gallery-panel');
        const mapEl = document.querySelector('.map-panel');
        const isHidden = forceHide !== undefined ? forceHide : !panel.classList.contains('panel-hidden');
        panel.classList.toggle('panel-hidden', isHidden);
        if (mapEl) mapEl.classList.toggle('gallery-hidden-active', isHidden);
        setTimeout(() => mapController.map.invalidateSize(), 50);
    };
    document.getElementById('toggleGalleryPanelBtn')?.addEventListener('click', () => _toggleGalleryPanel());
    document.getElementById('reopenGalleryPanelBtn')?.addEventListener('click', () => _toggleGalleryPanel(false));

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

    // Importar metadatos desde JSON o CSV
    document.getElementById('importBtn')?.addEventListener('click', () => {
        document.getElementById('importFileInput')?.click();
    });

    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // reset para permitir reimportar el mismo archivo

        const text = await file.text();
        const isCsv = file.name.toLowerCase().endsWith('.csv');

        let ok;
        if (isCsv) {
            ok = metadataManager.importFromCSV(text);
        } else {
            ok = metadataManager.importFromJSON(text);
        }

        if (ok) {
            filterManager.applyFilters(null);
            uiManager.showToast(`Metadatos importados desde ${file.name}`, 'success');
        } else {
            uiManager.showToast(`Error al importar ${file.name}. Revisa el formato.`, 'error');
        }
    });

    // Exportar → abre el modal de descarga
    document.getElementById('exportBtn')?.addEventListener('click', () => {
        modalManager.openExportModal();
    });

    // Borrar todo el almacenamiento del navegador
    document.getElementById('clearStorageBtn')?.addEventListener('click', async () => {
        if (!confirm('¿Borrar todo el almacenamiento del navegador?\n\nSe eliminarán:\n• Directorio guardado\n• Ediciones manuales de metadatos\n• Notas del mapa\n• Caché de miniaturas TIFF\n\nLa página se recargará desde cero.')) return;
        try {
            await clearIDB();
            localStorage.clear();
            location.reload();
        } catch (e) {
            alert('Error al limpiar el almacenamiento: ' + e.message);
        }
    });

    // Optimization
    document.getElementById('optimizeBtn')?.addEventListener('click', () => {
        if (confirm('¿Optimizar metadatos?')) {
            const stats = metadataManager.optimizeMetadata();
            uiManager.showToast(`Optimizado: ${stats.cleaned} entradas.`, 'success');
            filterManager.applyFilters(null); // refresh preserving active search
        }
    });

    // Map Notes Control
    let noteControlBtn = null;
    const setNoteMode = (active) => {
        noteMode = active;
        if (noteControlBtn) noteControlBtn.classList.toggle('active', active);
        mapController.map.getContainer().style.cursor = active ? 'crosshair' : '';
    };

    const NoteControl = L.Control.extend({
        onAdd() {
            const btn = L.DomUtil.create('button', 'leaflet-bar note-control-btn');
            btn.innerHTML = '📝';
            btn.title = 'Añadir nota al mapa (Esc para cancelar)';
            btn.setAttribute('aria-label', 'Añadir nota al mapa');
            noteControlBtn = btn;
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                setNoteMode(!noteMode);
            });
            return btn;
        },
        onRemove() { noteControlBtn = null; }
    });
    new NoteControl({ position: 'topleft' }).addTo(mapController.map);

    mapController.onNoteDelete = (id) => {
        mapController.removeNote(id);
        saveNotes();
    };

    // Map Events
    mapController.onMarkerClick = (f) => selectImage(f);

    // Handle Marker Drag (Updates metadata and UI immediately)
    mapController.onMarkerDrag = (filename, newPos) => {
        metadataManager.updateMetadata(filename, { coordinates: { lat: newPos.lat, lng: newPos.lng }, _userCoords: true });

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

    // Dar de baja una imagen: excluirla de la colección activa en esta sesión
    const disableImage = (filename) => {
        metadataManager.updateMetadata(filename, { _disabled: true });
        state.currentImages = state.currentImages.filter(f => f !== filename);
        document.getElementById('totalCount').innerHTML = `<b>${state.currentImages.length}</b> catalogados`;
        filterManager.setImages(state.currentImages);
        filterManager.applyFilters(null);
        if (state.selectedImagesList.includes(filename)) {
            galleryRenderer.selectedImages.delete(filename);
            galleryRenderer.applySelectionStyles();
        }
        uiManager.showToast(`Imagen dada de baja: ${filename}`, 'info');
    };
    uiManager._panel.onImageDisabled = disableImage;
    modalManager.onImageDisabled = disableImage;

    // Vista previa de coordenadas en tiempo real (mientras se edita el campo)
    uiManager._panel.onCoordinatePreview = (lat, lng) => {
        if (lat !== null && lng !== null) {
            mapController.showPreviewMarker(lat, lng);
        } else {
            mapController.hidePreviewMarker();
        }
    };

    mapController.onMapClick = (e) => {
        // Modo asignación de coordenadas en lote
        if (uiManager._batchCoordsMode) {
            uiManager._batchCoordsMode = false;
            document.body.classList.remove('batch-coords-active');
            const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
            const count = state.selectedImagesList.length;
            state.selectedImagesList.forEach(f => {
                metadataManager.updateMetadata(f, { coordinates: coords, _userCoords: true });
                mapController.addOrUpdateMarker(f, metadataManager.getMetadata(f));
            });
            filterManager.applyFilters(null);
            uiManager.showToast(`Coordenadas asignadas a ${count} imágenes`, 'success');
            return;
        }

        // Note placement mode: single-shot, always exits after one click
        if (noteMode) {
            setNoteMode(false);
            const text = prompt('Texto de la nota:');
            if (text && text.trim()) {
                mapController.addNote(e.latlng.lat, e.latlng.lng, text.trim());
                saveNotes();
            }
            return;
        }

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
                metadataManager.updateMetadata(file, { coordinates: pos, _userCoords: true });
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

    // Safety net: persistir ediciones pendientes antes de cerrar/recargar la pestaña
    window.addEventListener('pagehide', () => {
        metadataManager.flushSave();
    });

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
        // Ctrl+G: Guardar inmediatamente (flush sin debounce)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            metadataManager.flushSave().then(() => {
                uiManager.showToast('Cambios guardados en navegador (Ctrl+G)', 'success');
            });
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

        // AvPág / RePág / Inicio / Fin: Navegar por la galería con selección
        const anyModalOpen = modalManager.isImageModalOpen() || modalManager.isEditModalOpen();
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (!anyModalOpen && activeTag !== 'input' && activeTag !== 'textarea' && state.filteredImages.length > 0) {
            if (e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                const images = state.filteredImages;
                const current = state.primarySelectedImage;
                let idx = current ? images.indexOf(current) : -1;
                const pageSize = 25;

                if (e.key === 'PageDown') idx = Math.min(idx + pageSize, images.length - 1);
                else if (e.key === 'PageUp') idx = Math.max(idx - pageSize, 0);
                else if (e.key === 'Home') idx = 0;
                else if (e.key === 'End') idx = images.length - 1;

                if (idx < 0) idx = 0;
                uiManager.updateSelection([images[idx]]);
            }
        }

        // ESCAPE: cancelar modo nota
        if (e.key === 'Escape' && noteMode) {
            setNoteMode(false);
            return;
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

    // On-demand TIFF decode cuando la tarjeta entra en el viewport
    window.addEventListener('tiffDecodeRequest', (e) => {
        const { filename } = e.detail;
        const file = state.tiffFileMap.get(filename);
        if (file) {
            const meta = metadataManager.getMetadata(filename);
            if (meta._needsDecode && !meta._previewUrl) {
                decodeSingleTiff(filename, file, { metadataManager, uiManager });
            }
        }
    });

    // Rotación de imagen: refrescar tarjeta y panel sin re-renderizar galería
    window.addEventListener('imageRotated', (e) => {
        const { filename } = e.detail;
        uiManager.updateGalleryItem(filename);
        if (state.primarySelectedImage === filename) {
            uiManager.renderMetadataPanel(filename);
        }
    });

    // Escuchar eventos de actualización en lote disparados desde UIManager
    window.addEventListener('metadataBatchUpdated', (e) => {
        // Re-filtrar preservando la búsqueda activa (null = no tocar lastQuery)
        searchWorkerClient.update(metadataManager.getAllMetadata());
        filterManager.applyFilters(null, false);
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
            dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            // Guardar para futuras sesiones
            await set('visor_historico_dir_handle', dirHandle);
        }

        state.dirHandle = dirHandle;
        uiManager.showToast('Cargando directorio...', 'normal');

        // RESET COMPLETO — borra metadatos anteriores y ediciones manuales
        metadataManager.suspendSave();
        await metadataManager.resetForNewDirectory();

        state.currentImages = [];
        state.allScannedFiles = [];
        state.tiffFileMap.clear();
        const pendingTiffs = [];

        // Primero: escanear el directorio completo y recoger JSON e imágenes por separado
        const jsonFiles = []; // { name, file } para elegir el más reciente
        let notesFileText = null; // contenido de visor_notas.json si existe

        for await (const entry of dirHandle.values()) {
            if (entry.kind !== 'file') continue;
            state.allScannedFiles.push(entry.name);

            if (entry.name.toLowerCase() === 'visor_notas.json') {
                // Archivo de notas del mapa — cargar por separado
                const file = await entry.getFile();
                notesFileText = await file.text();
                continue;
            }

            if (entry.name.toLowerCase().endsWith('.json')) {
                const file = await entry.getFile();
                jsonFiles.push({ name: entry.name, file });
                continue;
            }

            if (entry.name.match(/\.(jpg|jpeg|png|webp|tif|tiff)$/i)) {
                state.currentImages.push(entry.name);
                const file = await entry.getFile();
                const isTiff = /\.(tif|tiff)$/i.test(entry.name);

                if (isTiff) {
                    pendingTiffs.push({ name: entry.name, file });
                    state.tiffFileMap.set(entry.name, file);
                    metadataManager.setVolatileData(entry.name, {
                        _isProcessing: false,
                        _needsDecode: true,
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

        // Cargar el JSON más reciente si hay alguno
        if (jsonFiles.length > 0) {
            // Ordenar por fecha de modificación descendente → el más reciente primero
            jsonFiles.sort((a, b) => b.file.lastModified - a.file.lastModified);
            const newest = jsonFiles[0];
            logger.log(`JSON más reciente detectado: ${newest.name} (${jsonFiles.length} encontrados)`);
            const text = await newest.file.text();
            if (metadataManager.importFromJSON(text)) {
                uiManager.showToast(
                    jsonFiles.length > 1
                        ? `Metadatos cargados: ${newest.name} (más reciente de ${jsonFiles.length})`
                        : `Metadatos cargados: ${newest.name}`,
                    'success'
                );
            }
        }

        // Cargar notas del mapa: desde archivo de la carpeta o IDB como fallback
        if (notesFileText) {
            try {
                const notes = JSON.parse(notesFileText);
                mapController.loadNotes(notes);
                await set('map_notes', notes); // sincronizar IDB
                logger.log(`Notas cargadas desde visor_notas.json (${notes.length})`);
            } catch (e) {
                logger.warn('Error al parsear visor_notas.json:', e);
            }
        } else {
            // Fallback: usar notas guardadas en IDB
            const idbNotes = await get('map_notes') || [];
            mapController.loadNotes(idbNotes);
        }

        // Pass only images to stats service for consistency
        if (statsService.setAllFiles) {
            statsService.setAllFiles(state.currentImages);
        }

        document.getElementById('totalCount').innerHTML = `<b>${state.currentImages.length}</b> catalogados`;
        filterManager.setImages(state.currentImages);
        filterManager.renderControllers();

        // Limpieza de ediciones huérfanas: archivos borrados o renombrados en disco
        metadataManager.pruneOrphanEdits(state.currentImages);

        metadataManager.resumeSave(); // Re-enable and save once

        // Initialize search worker with current metadata
        searchWorkerClient.init(metadataManager.getAllMetadata());

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

        // TIFFs are now decoded on-demand when cards enter viewport (Feature 5)
        // decodeTiffsInBackground is kept for backward compatibility but not called here

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
    }
}

// Wrapper legacy para marcadores (devuelven string simple)
function selectImage(filename) {
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
        // Re-filtrar sin destruir el DOM de los filtros, preservando la búsqueda activa
        filterManager.applyFilters(null, false);
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

async function saveNotes() {
    const notes = mapController.mapNotes;
    // Guardar en IDB (siempre disponible)
    await set('map_notes', notes);
    // Guardar en visor_notas.json dentro de la carpeta cargada
    if (state.dirHandle) {
        try {
            const fileHandle = await state.dirHandle.getFileHandle('visor_notas.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(notes, null, 2));
            await writable.close();
        } catch (e) {
            logger.warn('No se pudieron guardar notas en archivo:', e);
        }
    }
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
