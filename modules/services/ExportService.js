/**
 * ExportService
 * Handles dataset generation and file download operations.
 */
export default class ExportService {
    constructor(metadataManager) {
        this.metadataManager = metadataManager;
    }

    /**
     * Generates a CSV string filtered to the given filenames.
     * @param {string[]} filenames
     * @returns {string}
     */
    generateDatasetForFiles(filenames) {
        return this.generateScientificDataset(filenames);
    }

    /**
     * Generates a CSV string from the current metadata.
     * @param {string[]|null} filenames - If provided, only export these filenames.
     * @returns {string} The CSV content.
     */
    generateScientificDataset(filenames = null) {
        const allMetadata = this.metadataManager.getAllMetadata();

        // CSV Headers
        const headers = [
            'filename',
            'type',
            'extension',
            'mainSubject',
            'author',
            'location',
            'dateRange_start',
            'dateRange_end',
            'centuries',
            'reign',
            'conservationStatus',
            'sourceUrl',
            'authorUrl',
            'fullPath',
            'hasCoordinates',
            'latitude',
            'longitude',
            'notes',
            'fileSize_bytes'
        ];

        // CSV Rows
        const entries = filenames
            ? Object.entries(allMetadata).filter(([fn]) => filenames.includes(fn))
            : Object.entries(allMetadata);
        const rows = entries.map(([filename, meta]) => {
            // Extract extension
            const extMatch = filename.match(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp)$/i);
            const extension = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : '';

            // Check coordinates
            const hasCoords = meta.coordinates && meta.coordinates.lat != null && meta.coordinates.lng != null;

            return [
                this.escapeCsvValue(filename),
                this.escapeCsvValue(meta.type || ''),
                this.escapeCsvValue(extension),
                this.escapeCsvValue(meta.mainSubject || ''),
                this.escapeCsvValue(meta.author || ''),
                this.escapeCsvValue(meta.location || ''),
                this.escapeCsvValue(meta.dateRange?.start || ''),
                this.escapeCsvValue(meta.dateRange?.end || ''),
                this.escapeCsvValue((meta.centuries || []).join(',')), // Separar múltiples siglos con coma
                this.escapeCsvValue(meta.reign || ''),
                this.escapeCsvValue(meta.conservationStatus || ''),
                this.escapeCsvValue(meta.sourceUrl || ''),
                this.escapeCsvValue(meta.authorUrl || ''),
                this.escapeCsvValue(meta.fullPath || ''),
                hasCoords ? '"1"' : '"0"',
                hasCoords ? `"${meta.coordinates.lat}"` : '""',
                hasCoords ? `"${meta.coordinates.lng}"` : '""',
                this.escapeCsvValue(meta.notes || ''),
                `"${meta._fileSize || ''}"`
            ].join('|'); // Delimitador: barra vertical
        });

        // Combine headers and rows
        return [headers.map(h => `"${h}"`).join('|'), ...rows].join('\n');
    }

    /**
     * Escapes a value for CSV format (delimitador |, calificador de texto ").
     * - Saltos de línea → ↵ (evita campos multilínea que rompen parsers)
     * - Barras verticales → ∣ (barra vertical matemática U+2223)
     * - Comillas dobles internas → "" (estándar RFC 4180)
     * - Cada campo queda envuelto en comillas dobles
     * @param {string|number} value
     * @returns {string}
     */
    escapeCsvValue(value) {
        if (value === null || value === undefined) return '""';
        const str = String(value)
            .replace(/\r\n|\r|\n/g, ' ↵ ')  // saltos de párrafo → símbolo visible
            .replace(/\|/g, '∣')            // pipe literal → barra vertical matemática
            .replace(/"/g, '""');            // comillas internas → doble comilla (RFC 4180)
        return `"${str}"`;
    }

    /**
     * Triggers the download of the dataset.
     * @param {string[]|null} filenames - If provided, only export these filenames.
     */
    downloadScientificDataset(filenames = null) {
        const csv = this.generateScientificDataset(filenames);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `coleccion-historica-dataset_${timestamp}.csv`;

        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        return filename;
    }
}
