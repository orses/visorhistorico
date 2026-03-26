/**
 * Constantes compartidas entre módulos del Visor Histórico.
 */

/**
 * Escapa caracteres HTML para prevenir XSS al insertar texto en innerHTML.
 * @param {*} value
 * @returns {string}
 */
export function sanitize(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Tipos de documento disponibles (orden alfabético). */
export const DOCUMENT_TYPES = [
    'Dibujo',
    'Fotografía',
    'Grabado',
    'Ilustración',
    'Infografía 3D',
    'Maqueta',
    'Pintura',
    'Plano',
    'Recreación Visual',
    'Texto'
];

/** Estados de conservación disponibles. */
export const CONSERVATION_STATUSES = [
    'Sin clasificar',
    'Desaparecido',
    'En ruinas',
    'Modificado',
    'Conservado'
];
