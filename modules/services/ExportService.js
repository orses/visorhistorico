/**
 * ExportService
 * Handles dataset generation and file download operations.
 */
export default class ExportService {
    constructor(metadataManager) {
        this.metadataManager = metadataManager;
    }

    /**
     * Generates a CSV string from the current metadata.
     * @returns {string} The CSV content.
     */
    generateScientificDataset() {
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
            'hasCoordinates',
            'latitude',
            'longitude',
            'notes',
            'fileSize_bytes'
        ];

        // CSV Rows
        const rows = Object.entries(allMetadata).map(([filename, meta]) => {
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
                this.escapeCsvValue((meta.centuries || []).join('|')), // Usar pipe para separar múltiples siglos
                this.escapeCsvValue(meta.reign || ''),
                this.escapeCsvValue(meta.conservationStatus || ''),
                hasCoords ? '1' : '0',
                hasCoords ? meta.coordinates.lat : '',
                hasCoords ? meta.coordinates.lng : '',
                this.escapeCsvValue(meta.notes || ''),
                meta._fileSize || ''
            ].join(';'); // Delimitador: punto y coma
        });

        // Combine headers and rows
        return [headers.join(';'), ...rows].join('\n');
    }

    /**
     * Escapes a value for CSV format.
     * @param {string|number} value 
     * @returns {string}
     */
    escapeCsvValue(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Si contiene punto y coma, comilla, o salto de línea, envolver en comillas y escapar comillas internas
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    /**
     * Triggers the download of the dataset.
     */
    downloadScientificDataset() {
        const csv = this.generateScientificDataset();
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
