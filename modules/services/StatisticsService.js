/**
 * StatisticsService
 * Generates statistics from metadata.
 */
export default class StatisticsService {
    constructor(metadataManager) {
        this.metadataManager = metadataManager;
        this.allFiles = [];
    }

    setAllFiles(files) {
        this.allFiles = files;
    }

    /**
     * Generates a comprehensive statistics object.
     * @returns {Object} Stats object.
     */
    generateStatistics() {
        const allMetadata = this.metadataManager.getAllMetadata();
        // Use allFiles if available, otherwise fallback to metadata keys (backward/partial compatibility)
        const fileList = this.allFiles.length > 0 ? this.allFiles : Object.keys(allMetadata);

        const stats = {
            total: fileList.length,
            cataloged: Object.keys(allMetadata).length,
            byType: {},
            byExtension: {},
            byCentury: {},
            byConservation: {},
            withCoordinates: 0,
            withoutCoordinates: 0
        };

        fileList.forEach(filename => {
            // Extension (from filename)
            const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/i);
            const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'sin-extensión';
            stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;

            // Metadata-based stats (only if in metadata)
            const meta = allMetadata[filename];
            if (meta) {
                // Type
                const type = meta.type || 'Sin tipo';
                stats.byType[type] = (stats.byType[type] || 0) + 1;

                // Century
                if (meta.centuries && meta.centuries.length > 0) {
                    meta.centuries.forEach(c => {
                        stats.byCentury[c] = (stats.byCentury[c] || 0) + 1;
                    });
                } else {
                    stats.byCentury['Sin siglo'] = (stats.byCentury['Sin siglo'] || 0) + 1;
                }

                // Conservation
                const conservation = meta.conservationStatus || 'Sin clasificar';
                stats.byConservation[conservation] = (stats.byConservation[conservation] || 0) + 1;

                // Coordinates
                const hasCoords = meta.coordinates && meta.coordinates.lat != null && meta.coordinates.lng != null;
                if (hasCoords) {
                    stats.withCoordinates++;
                } else {
                    stats.withoutCoordinates++;
                }
            } else {
                // Not cataloged / Non-image
                stats.byType['No Catalogado'] = (stats.byType['No Catalogado'] || 0) + 1;
            }
        });

        return stats;
    }
}
