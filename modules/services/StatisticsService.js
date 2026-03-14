import Chart from 'chart.js/auto';

/**
 * StatisticsService
 * Generates statistics from metadata and renders interactive charts.
 */
export default class StatisticsService {
    constructor(metadataManager) {
        this.metadataManager = metadataManager;
        this.allFiles = [];
        this.charts = []; // Mantener referencia para destruir gráficos previos
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

    /**
     * Devuelve el HTML base para las estadísticas y luego dibuja los gráficos
     */
    generateStatisticsHTML() {
        const stats = this.generateStatistics();

        // Destruir gráficos anteriores si existían
        this.charts.forEach(c => c.destroy());
        this.charts = [];

        // HTML Base con Canvas integrados
        const html = `
            <div class="stats-container" style="padding: 1rem; color: #fff;">
                <h3 style="margin-bottom: 20px; color: #00f2fe; border-bottom: 1px solid #333; padding-bottom: 10px;">Resumen de Colección</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
                        <h4 style="font-size: 24px; margin-bottom: 5px; color: #00ffa3;">${stats.total}</h4>
                        <span style="font-size: 12px; color: #9ca3af;">Archivos Totales</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
                        <h4 style="font-size: 24px; margin-bottom: 5px; color: #00f2fe;">${stats.withCoordinates}</h4>
                        <span style="font-size: 12px; color: #9ca3af;">Imágenes Georreferenciadas</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                    <!-- Gráfico de Tipos -->
                    <div style="background: #1a1a25; border-radius: 8px; padding: 15px;">
                        <canvas id="chartTypes" height="200"></canvas>
                    </div>
                    
                    <!-- Gráfico de Siglos -->
                    <div style="background: #1a1a25; border-radius: 8px; padding: 15px;">
                        <canvas id="chartCenturies" height="200"></canvas>
                    </div>
                </div>
            </div>
        `;

        // Pequeño timeout para permitir que React/DOM renderice el HTML devuelto
        // antes de que Chart.js intente buscar los IDs del canvas
        setTimeout(() => this.renderCharts(stats), 50);

        return html;
    }

    renderCharts(stats) {
        Chart.defaults.color = '#9ca3af';

        // 1. Chart Types (Doughnut)
        const ctxTypes = document.getElementById('chartTypes');
        if (ctxTypes) {
            const chartTypes = new Chart(ctxTypes, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(stats.byType),
                    datasets: [{
                        data: Object.values(stats.byType),
                        backgroundColor: ['#00f2fe', '#4facfe', '#00ffa3', '#fbc2eb', '#a18cd1', '#ff9a9e'],
                        borderWidth: 0
                    }]
                },
                options: {
                    plugins: {
                        legend: { position: 'bottom' },
                        title: { display: true, text: 'Distribución por Tipología', color: '#fff' }
                    }
                }
            });
            this.charts.push(chartTypes);
        }

        // 2. Chart Centuries (Bar)
        const ctxCenturies = document.getElementById('chartCenturies');
        if (ctxCenturies) {
            // Ordenar siglos cronológicamente (aprox) si es posible
            const labels = Object.keys(stats.byCentury).sort();
            const data = labels.map(l => stats.byCentury[l]);

            const chartCenturies = new Chart(ctxCenturies, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Fotografías / Elementos',
                        data: data,
                        backgroundColor: '#4facfe',
                        borderRadius: 4
                    }]
                },
                options: {
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#333' } },
                        x: { grid: { display: false } }
                    },
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'Distribución Temporal', color: '#fff' }
                    }
                }
            });
            this.charts.push(chartCenturies);
        }
    }
}
