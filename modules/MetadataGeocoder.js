/**
 * MetadataGeocoder
 * Geocodificación básica de ubicaciones conocidas de Madrid.
 */
const KNOWN_LOCATIONS = {
    'Sol, puerta del': { lat: 40.4169, lng: -3.7033 },
    'Puerta del Sol': { lat: 40.4169, lng: -3.7033 },
    'Mayor, plaza': { lat: 40.4155, lng: -3.7074 },
    'Plaza Mayor': { lat: 40.4155, lng: -3.7074 },
    'Palacio Real': { lat: 40.4180, lng: -3.7143 },
    'Real, palacio': { lat: 40.4180, lng: -3.7143 },
    'Cebada, plaza de la de': { lat: 40.4089, lng: -3.7081 },
    'Alcalá, puerta de': { lat: 40.4201, lng: -3.6885 },
    'Puerta de Alcalá': { lat: 40.4201, lng: -3.6885 },
    'Toledo, puerta de': { lat: 40.4065, lng: -3.7085 },
    'Puerta de Toledo': { lat: 40.4065, lng: -3.7085 },
    'Prado': { lat: 40.4138, lng: -3.6921 },
    'Retiro': { lat: 40.4153, lng: -3.6844 },
    'Cibeles, plaza de': { lat: 40.4189, lng: -3.6936 },
    'Plaza de Cibeles': { lat: 40.4189, lng: -3.6936 },
    'Atocha, estación de': { lat: 40.4065, lng: -3.6915 },
    'Estación de Atocha': { lat: 40.4065, lng: -3.6915 },
    'Colón, plaza de': { lat: 40.4250, lng: -3.6903 },
    'España, plaza de': { lat: 40.4239, lng: -3.7122 },
    'Oriente, plaza de': { lat: 40.4180, lng: -3.7143 },
    'Callao, plaza de': { lat: 40.4197, lng: -3.7059 },
    'Cárcel de Corte': { lat: 40.4147, lng: -3.7056 },
    'Santa Cruz, palacio de': { lat: 40.4147, lng: -3.7056 },
    'San Gil, cuartel de': { lat: 40.423, lng: -3.712 },
    'San Gil, real monasterio de': { lat: 40.419, lng: -3.713 },
};

/**
 * Devuelve coordenadas para una ubicación conocida de Madrid.
 * @param {string} location
 * @param {string} city
 * @returns {{ lat: number, lng: number } | null}
 */
export function getCoordinates(location, city = 'Madrid') {
    if (!location) return null;

    if (city && !city.toLowerCase().includes('madrid') && city.trim() !== '') {
        return null;
    }

    const loc = location.toLowerCase().replace(/^madrid\s*-\s*/, '');

    for (const [name, coords] of Object.entries(KNOWN_LOCATIONS)) {
        if (loc.includes(name.toLowerCase())) {
            return { ...coords };
        }
    }

    if (!city || city.toLowerCase().includes('madrid')) {
        return { lat: 40.4168, lng: -3.7038 };
    }

    return null;
}
