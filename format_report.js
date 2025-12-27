const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, 'analysis_report.json');
const outputPath = path.join(__dirname, 'reporte_incongruencias.md');

try {
    const rawData = fs.readFileSync(reportPath, 'utf8');
    const inconsistencies = JSON.parse(rawData);

    let mdContent = '# Reporte de Incongruencias en Nombres de Archivos\n\n';
    mdContent += `Total de incidencias encontradas: ${inconsistencies.length}\n\n`;

    // Agrupar por tipo
    const grouped = {};
    inconsistencies.forEach(item => {
        if (!grouped[item.type]) {
            grouped[item.type] = [];
        }
        grouped[item.type].push(item);
    });

    for (const type in grouped) {
        mdContent += `## ${type} (${grouped[type].length})\n\n`;

        // Agrupar por mensaje específico para reducir ruido si hay muchos iguales
        const byMsg = {};
        grouped[type].forEach(item => {
            if (!byMsg[item.msg]) {
                byMsg[item.msg] = [];
            }
            byMsg[item.msg].push(item.file);
        });

        for (const msg in byMsg) {
            mdContent += `### ${msg}\n`;
            byMsg[msg].forEach(file => {
                mdContent += `- \`${file}\`\n`;
            });
            mdContent += '\n';
        }
    }

    fs.writeFileSync(outputPath, mdContent, 'utf8');
    console.log(`Reporte generado en: ${outputPath}`);

} catch (err) {
    console.error("Error generando reporte:", err);
}
