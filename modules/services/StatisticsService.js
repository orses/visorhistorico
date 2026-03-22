import Chart from 'chart.js/auto';

/**
 * StatisticsService
 * Generates statistics from metadata and renders static bar charts.
 */
export default class StatisticsService {
    constructor(metadataManager) {
        this.metadataManager = metadataManager;
        this.allFiles = [];
        this.charts = [];
    }

    setAllFiles(files) {
        this.allFiles = files;
    }

    generateStatistics() {
        const allMetadata = this.metadataManager.getAllMetadata();
        const fileList = this.allFiles.length > 0 ? this.allFiles : Object.keys(allMetadata);

        const stats = {
            total: fileList.length,
            byType: {},
            byCentury: {},
            byConservation: {},
            withCoordinates: 0,
            withoutCoordinates: 0
        };

        fileList.forEach(filename => {
            const meta = allMetadata[filename];
            if (meta) {
                stats.byType[meta.type || 'Sin tipo'] = (stats.byType[meta.type || 'Sin tipo'] || 0) + 1;

                if (meta.centuries && meta.centuries.length > 0) {
                    meta.centuries.forEach(c => {
                        stats.byCentury[c] = (stats.byCentury[c] || 0) + 1;
                    });
                } else {
                    stats.byCentury['Sin siglo'] = (stats.byCentury['Sin siglo'] || 0) + 1;
                }

                stats.byConservation[meta.conservationStatus || 'Sin clasificar'] =
                    (stats.byConservation[meta.conservationStatus || 'Sin clasificar'] || 0) + 1;

                if (meta.coordinates && meta.coordinates.lat != null && meta.coordinates.lng != null) {
                    stats.withCoordinates++;
                } else {
                    stats.withoutCoordinates++;
                }
            } else {
                stats.byType['No catalogado'] = (stats.byType['No catalogado'] || 0) + 1;
                stats.withoutCoordinates++;
            }
        });

        return stats;
    }

    generateStatisticsHTML() {
        const stats = this.generateStatistics();

        this.charts.forEach(c => c.destroy());
        this.charts = [];

        const html = `
            <div class="stats-container" style="padding:1rem;color:#fff;">
                <h3 style="margin-bottom:20px;color:#00f2fe;border-bottom:1px solid #333;padding-bottom:10px;">Resumen de Colección</h3>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:28px;">
                    <div style="background:rgba(255,255,255,0.05);padding:15px;border-radius:8px;text-align:center;">
                        <div style="font-size:28px;font-weight:700;color:#00ffa3;">${stats.total}</div>
                        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Archivos totales</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);padding:15px;border-radius:8px;text-align:center;">
                        <div style="font-size:28px;font-weight:700;color:#00f2fe;">${stats.withCoordinates}</div>
                        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Georreferenciadas</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);padding:15px;border-radius:8px;text-align:center;">
                        <div style="font-size:28px;font-weight:700;color:#fbc2eb;">${stats.withoutCoordinates}</div>
                        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Sin coordenadas</div>
                    </div>
                </div>

                <!-- Distribución temporal (columnas, ancho completo) -->
                <div style="background:#1a1a25;border-radius:8px;padding:16px;margin-bottom:20px;">
                    <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:12px;">Distribución temporal</div>
                    <canvas id="chartCenturies" height="90"></canvas>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                    <!-- Tipología -->
                    <div style="background:#1a1a25;border-radius:8px;padding:16px;">
                        <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:12px;">Tipología</div>
                        <canvas id="chartTypes"></canvas>
                    </div>

                    <!-- Conservación -->
                    <div style="background:#1a1a25;border-radius:8px;padding:16px;">
                        <div style="font-size:13px;font-weight:600;color:#ccc;margin-bottom:12px;">Estado de conservación</div>
                        <canvas id="chartConservation"></canvas>
                    </div>
                </div>
            </div>
        `;

        setTimeout(() => this.renderCharts(stats), 50);
        return html;
    }

    // Convierte número romano a entero para ordenar cronológicamente
    _romanToInt(str) {
        if (str === 'Sin siglo') return -1;
        const map = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
        let n = 0;
        for (let i = 0; i < str.length; i++) {
            const cur = map[str[i]] || 0;
            const next = map[str[i+1]] || 0;
            n += cur < next ? -cur : cur;
        }
        return n;
    }

    _barOptions(horizontal = true) {
        return {
            animation: false,
            indexAxis: horizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: '#2a2a3a' },
                    ticks: { color: '#9ca3af', font: { size: 11 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#ccc', font: { size: 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed[horizontal ? 'x' : 'y']} imágenes`
                    }
                }
            }
        };
    }

    renderCharts(stats) {
        Chart.defaults.color = '#9ca3af';

        // --- 1. Distribución temporal (columnas verticales, orden cronológico) ---
        const ctxCenturies = document.getElementById('chartCenturies');
        if (ctxCenturies) {
            const centuryOrder = ['Sin siglo','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI'];
            const allCenturies = Object.keys(stats.byCentury);
            const sorted = [
                ...centuryOrder.filter(c => allCenturies.includes(c)),
                ...allCenturies.filter(c => !centuryOrder.includes(c)).sort((a,b) => this._romanToInt(a) - this._romanToInt(b))
            ];
            const opts = this._barOptions(false);
            opts.scales.y.grid = { color: '#2a2a3a' };
            opts.scales.x.grid = { display: false };
            opts.scales.y.ticks = { color: '#9ca3af', font: { size: 11 } };
            opts.scales.x.ticks = { color: '#ccc', font: { size: 11 } };
            this.charts.push(new Chart(ctxCenturies, {
                type: 'bar',
                data: {
                    labels: sorted,
                    datasets: [{ data: sorted.map(c => stats.byCentury[c] || 0), backgroundColor: '#4facfe', borderRadius: 3 }]
                },
                options: opts
            }));
        }

        // --- 2. Tipología (barras horizontales, ordenadas por cantidad desc) ---
        const ctxTypes = document.getElementById('chartTypes');
        if (ctxTypes) {
            const sorted = Object.entries(stats.byType).sort((a,b) => b[1]-a[1]);
            const colors = ['#00f2fe','#4facfe','#00ffa3','#fbc2eb','#a18cd1','#ff9a9e','#ffecd2','#a1c4fd','#c2e9fb','#d4fc79','#96e6a1','#84fab0','#8fd3f4'];
            const opts = this._barOptions(true);
            opts.maintainAspectRatio = false;
            ctxTypes.parentElement.style.height = Math.max(180, sorted.length * 28 + 40) + 'px';
            this.charts.push(new Chart(ctxTypes, {
                type: 'bar',
                data: {
                    labels: sorted.map(e => e[0]),
                    datasets: [{ data: sorted.map(e => e[1]), backgroundColor: sorted.map((_, i) => colors[i % colors.length]), borderRadius: 3 }]
                },
                options: opts
            }));
        }

        // --- 3. Conservación (barras horizontales, ordenadas por cantidad desc) ---
        const ctxConservation = document.getElementById('chartConservation');
        if (ctxConservation) {
            const conservationColors = {
                'Conservado':     '#00ffa3',
                'Buen estado':    '#4facfe',
                'Regular':        '#ffecd2',
                'Deteriorado':    '#ff9a9e',
                'Muy deteriorado':'#a18cd1',
                'Desaparecido':   '#9ca3af',
                'Sin clasificar': '#444'
            };
            const sorted = Object.entries(stats.byConservation).sort((a,b) => b[1]-a[1]);
            const opts = this._barOptions(true);
            opts.maintainAspectRatio = false;
            ctxConservation.parentElement.style.height = Math.max(180, sorted.length * 28 + 40) + 'px';
            this.charts.push(new Chart(ctxConservation, {
                type: 'bar',
                data: {
                    labels: sorted.map(e => e[0]),
                    datasets: [{ data: sorted.map(e => e[1]), backgroundColor: sorted.map(e => conservationColors[e[0]] || '#4facfe'), borderRadius: 3 }]
                },
                options: opts
            }));
        }
    }
}
