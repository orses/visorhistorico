
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
let selectedImage = null;

// --- INITIALIZATION ---
async function init() {
    metadataManager = new MetadataManager();
    searchEngine = new SearchEngine(metadataManager);

    // Map controller expects container ID
    mapController = new MapController('map');

    uiManager = new UIManager(metadataManager, selectImage);
    statsService = new StatisticsService(metadataManager);
    exportService = new ExportService(metadataManager);

    // Filter logic has been split:
    // galleryFiles -> Matches ALL filters (including "Sin Coordenadas")
    // mapFiles -> Matches context filters (Century, etc.) but ALWAYS includes valid coordinates (ignores "Sin Coordenadas" restriction)
    filterManager = new FilterManager(metadataManager, searchEngine, (galleryFiles, mapFiles) => {
        // 1. Update Gallery
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

    // Listener global para clics en imágenes de popups (delegación)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('popup-image') && e.target.dataset.filename) {
            modalManager.openImageModal(e.target.dataset.filename);
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

        refreshUI(filename);
        uiManager.showToast('Cambios guardados', 'success');
    });

    setupGlobalListeners();

    // Initial State: Empty until load
    uiManager.renderGallery([]);
}

function setupGlobalListeners() {
    // Load Button
    document.getElementById('loadDirBtn')?.addEventListener('click', () => {
        console.log('Botón Cargar clickeado - Intentando abrir selector de directorio...');
        loadImagesFromDirectory();
    });

    // Search Input
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        document.getElementById('clearSearchBtn').classList.toggle('hidden', !q);

        if (window.searchTimeout) clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => filterManager.applyFilters(q), 300);
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

        // Update Details Panel if this is the selected image
        if (selectedImage === filename) {
            const meta = metadataManager.getMetadata(filename);
            // We can re-render the whole panel or just the specific field. 
            // Ideally UI Manager should expose a partial update, but re-render is safe.
            uiManager.renderMetadataPanel(filename, meta);
        }

        uiManager.showToast('Ubicación actualizada (Arrastrar)', 'success');
    };

    mapController.onMapClick = (e) => {
        if (selectedImage && e.originalEvent.ctrlKey) {
            const pos = { lat: e.latlng.lat, lng: e.latlng.lng };
            metadataManager.updateMetadata(selectedImage, { coordinates: pos });
            mapController.addOrUpdateMarker(selectedImage, metadataManager.getMetadata(selectedImage));

            // Si estamos filtrando por "Sin Coordenadas", al ponerle una, debe desaparecer de la lista.
            // Para eso reaplicamos filtros.
            filterManager.applyFilters();

            refreshUI(selectedImage);
            uiManager.showToast('Ubicación actualizada', 'success');
        }
    };

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
    });
}


let allScannedFiles = []; // For statistics

async function loadImagesFromDirectory() {
    try {
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

        const dirHandle = await window.showDirectoryPicker();
        uiManager.showToast('Cargando directorio...', 'normal');

        metadataManager.suspendSave(); // Avoid 1000+ writes to localStorage

        currentImages = [];
        allScannedFiles = [];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                allScannedFiles.push(entry.name);

                // Only images for gallery
                if (entry.name.match(/\.(jpg|jpeg|png|webp|tif|tiff)$/i)) {
                    currentImages.push(entry.name);

                    // Create preview URL (Blob) for browser access
                    const file = await entry.getFile();
                    const previewUrl = URL.createObjectURL(file);

                    // Update metadata cache with ephemeral data
                    const meta = metadataManager.getMetadata(entry.name);
                    metadataManager.updateMetadata(entry.name, {
                        _previewUrl: previewUrl,
                        _fileSize: file.size
                    });
                }
            }
        }

        // Pass scanned files to stats service (assuming we add a method for it next)
        if (statsService.setAllFiles) {
            statsService.setAllFiles(allScannedFiles);
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

function selectImage(filename) {
    selectedImage = filename;
    uiManager.updateSelection(filename);
    uiManager.renderMetadataPanel(filename);
    mapController.focusMarker(filename);
}

function refreshUI(filename) {
    if (selectedImage === filename) {
        uiManager.renderMetadataPanel(filename);
    }
    // Update gallery item visuals (status dot) - simplified re-render of just that item?
    // For now, re-render filtered is safest but slow. 
    // filterManager.applyFilters(); 
}

document.addEventListener('DOMContentLoaded', init);
