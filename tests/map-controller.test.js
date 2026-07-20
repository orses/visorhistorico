import { describe, it, expect, beforeEach, vi } from 'vitest';

// MapController depende de Leaflet. Se sustituye para evitar que las pruebas
// unitarias dependan de un mapa real en el DOM.
vi.mock('leaflet', () => ({
    default: {
        map: vi.fn(() => ({ on: vi.fn(), setView: vi.fn() })),
        tileLayer: vi.fn(() => ({})),
        tileLayer: { wms: vi.fn(() => ({})) },
        control: { layers: vi.fn(() => ({ addTo: vi.fn() })) },
        markerClusterGroup: vi.fn(() => ({ addTo: vi.fn(), removeLayer: vi.fn() })),
        layerGroup: vi.fn(() => ({ addTo: vi.fn() })),
        marker: vi.fn(() => ({ bindPopup: vi.fn(), on: vi.fn(), addTo: vi.fn() })),
        divIcon: vi.fn(() => ({})),
    },
}));

vi.mock('../modules/logger.js', () => ({
    default: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// La clase se importa después de sustituir sus dependencias.
const { default: MapController } = await import('../map-controller.js');

describe('MapController._esc', () => {
    let mc;
    beforeEach(() => {
        // Se evita init(), ya que necesita un contenedor de mapa real.
        mc = Object.create(MapController.prototype);
    });

    it('escapes ampersands', () => {
        expect(mc._esc('A & B')).toBe('A &amp; B');
    });

    it('escapes < and >', () => {
        expect(mc._esc('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes double quotes', () => {
        expect(mc._esc('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
        expect(mc._esc("it's")).toBe("it&#39;s");
    });

    it('returns empty string for null/undefined', () => {
        expect(mc._esc(null)).toBe('');
        expect(mc._esc(undefined)).toBe('');
    });

    it('converts non-strings to string before escaping', () => {
        expect(mc._esc(42)).toBe('42');
    });

    it('leaves safe strings unchanged', () => {
        expect(mc._esc('Puerta del Sol')).toBe('Puerta del Sol');
    });
});

describe('MapController.hasValidCoordinates', () => {
    let mapController;

    beforeEach(() => {
        mapController = Object.create(MapController.prototype);
    });

    it('acepta coordenadas finitas situadas en los límites geográficos', () => {
        expect(mapController.hasValidCoordinates({ lat: -90, lng: -180 })).toBe(true);
        expect(mapController.hasValidCoordinates({ lat: 90, lng: 180 })).toBe(true);
        expect(mapController.hasValidCoordinates({ lat: 0, lng: 0 })).toBe(true);
    });

    it.each([
        null,
        {},
        { lat: '40', lng: -3 },
        { lat: 40, lng: Number.POSITIVE_INFINITY },
        { lat: Number.NaN, lng: -3 },
        { lat: 91, lng: -3 },
        { lat: 40, lng: -181 }
    ])('rechaza coordenadas no válidas: %j', (coordinates) => {
        expect(mapController.hasValidCoordinates(coordinates)).toBe(false);
    });
});

describe('MapController.updateMarkers', () => {
    let mapController;
    let markerLayer;

    beforeEach(() => {
        markerLayer = { removeLayer: vi.fn() };
        mapController = Object.create(MapController.prototype);
        mapController.markerLayer = markerLayer;
        mapController.markers = {};
        mapController.addMarker = vi.fn();
        mapController.addOrUpdateMarker = vi.fn();
    });

    it('añade los marcadores que todavía no existen', () => {
        const metadata = { coordinates: { lat: 40.4, lng: -3.7 } };

        mapController.updateMarkers({ imagen: metadata });

        expect(mapController.addMarker).toHaveBeenCalledWith('imagen', metadata);
        expect(mapController.addOrUpdateMarker).not.toHaveBeenCalled();
    });

    it('conserva el marcador cuando no han cambiado sus datos', () => {
        const metadata = {
            coordinates: { lat: 40.4, lng: -3.7 },
            mainSubject: 'Plaza Mayor'
        };
        mapController.markers.imagen = {
            getLatLng: () => ({ ...metadata.coordinates }),
            _metadataSignature: mapController._getMarkerSignature(metadata)
        };

        mapController.updateMarkers({ imagen: metadata });

        expect(mapController.addOrUpdateMarker).not.toHaveBeenCalled();
        expect(markerLayer.removeLayer).not.toHaveBeenCalled();
    });

    it('actualiza el marcador cuando cambian sus datos visibles', () => {
        const previousMetadata = {
            coordinates: { lat: 40.4, lng: -3.7 },
            mainSubject: 'Plaza Mayor'
        };
        const currentMetadata = {
            ...previousMetadata,
            mainSubject: 'Plaza Mayor de Madrid'
        };
        mapController.markers.imagen = {
            getLatLng: () => ({ ...previousMetadata.coordinates }),
            _metadataSignature: mapController._getMarkerSignature(previousMetadata)
        };

        mapController.updateMarkers({ imagen: currentMetadata });

        expect(mapController.addOrUpdateMarker).toHaveBeenCalledWith('imagen', currentMetadata);
    });

    it('elimina los marcadores que ya no pertenecen al conjunto visible', () => {
        const marker = { getLatLng: vi.fn() };
        mapController.markers.imagen = marker;

        mapController.updateMarkers({});

        expect(markerLayer.removeLayer).toHaveBeenCalledWith(marker);
        expect(mapController.markers).not.toHaveProperty('imagen');
    });
});

describe('MapController.panToCoordinates', () => {
    let mapController;

    beforeEach(() => {
        mapController = Object.create(MapController.prototype);
        mapController.map = {
            getZoom: vi.fn(() => 12),
            setView: vi.fn()
        };
    });

    it('centra el mapa y establece un nivel de acercamiento mínimo', () => {
        expect(mapController.panToCoordinates(40.4168, -3.7038)).toBe(true);
        expect(mapController.map.setView).toHaveBeenCalledWith([40.4168, -3.7038], 16);
    });

    it('no modifica el mapa si las coordenadas no son válidas', () => {
        expect(mapController.panToCoordinates(Number.POSITIVE_INFINITY, -3.7)).toBe(false);
        expect(mapController.map.setView).not.toHaveBeenCalled();
    });
});

describe('MapController.focusMarker', () => {
    it('indica que no existe un marcador oculto por los filtros', () => {
        const mapController = Object.create(MapController.prototype);
        mapController.markers = {};
        mapController.bringToFront = vi.fn();

        expect(mapController.focusMarker('imagen')).toBe(false);
    });
});
