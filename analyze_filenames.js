const fs = require('fs');
const path = require('path');

// Ajustar ruta al directorio de imágenes (padre del directorio actual gestor-coleccion)
const directoryPath = path.resolve(__dirname, '..');

console.log(`Analizando directorio: ${directoryPath}`);

let files;
try {
    files = fs.readdirSync(directoryPath).filter(file => file.toLowerCase().endsWith('.jpg'));
} catch (err) {
    console.error("Error leyendo directorio:", err);
    process.exit(1);
}

const yearReignMap = [
    { start: 1833, end: 1868, name: "Isabel II", matches: ["Isabel II"] },
    { start: 1868, end: 1871, name: "Gobierno Provisional", matches: ["Gobierno Provisional"] },
    { start: 1871, end: 1873, name: "Amadeo I", matches: ["Amadeo I"] },
    { start: 1873, end: 1874, name: "I República", matches: ["I República"] },
    { start: 1874, end: 1885, name: "Alfonso XII", matches: ["Alfonso XII"] },
    { start: 1885, end: 1902, name: "Regencia de María Cristina", matches: ["Regencia de María Cristina"] },
    { start: 1902, end: 1931, name: "Alfonso XIII", matches: ["Alfonso XIII"] },
    { start: 1931, end: 1939, name: "II República / Guerra Civil", matches: ["II República", "Guerra Civil"] },
    { start: 1939, end: 1975, name: "Dictadura", matches: ["Dictadura", "General Franco", "Franco"] },
    { start: 1975, end: 2014, name: "Juan Carlos I", matches: ["Juan Carlos I"] },
    { start: 2014, end: 2025, name: "Felipe VI", matches: ["Felipe VI"] }
];

const romanToNum = { 'XI': 11, 'XII': 12, 'XIII': 13, 'XIV': 14, 'XV': 15, 'XVI': 16, 'XVII': 17, 'XVIII': 18, 'XIX': 19, 'XX': 20, 'XXI': 21 };

const inconsistencies = [];

files.forEach(file => {
    // Basic format check: "Madrid - ..."
    if (!file.startsWith("Madrid - ")) {
        inconsistencies.push({ file, type: 'Formato', msg: 'No empieza por "Madrid - "' });
        return;
    }

    const parts = file.replace('.jpg', '').split(' - ');

    // Heuristic: Year is usually the first 4-digit number found.
    // Standard format seems to be: Madrid - Object - Year - Century - Reign - ...
    // But sometimes Year is later? Let's look for the year.
    let yearIndex = parts.findIndex(p => /^\d{4}$/.test(p));

    if (yearIndex === -1) {
        inconsistencies.push({ file, type: 'Año', msg: 'No se encontró un año de 4 dígitos' });
        return;
    }

    const yearStr = parts[yearIndex];
    const year = parseInt(yearStr);

    // Check Century (Next part)
    if (yearIndex + 1 < parts.length) {
        const century = parts[yearIndex + 1];
        const expectedCentury = Math.ceil(year / 100);
        const centuryNum = romanToNum[century];

        if (!centuryNum) {
            // Maybe it's not the century?
            inconsistencies.push({ file, type: 'Siglo', msg: `Se esperaba siglo tras el año, se encontró: '${century}'` });
        } else if (centuryNum !== expectedCentury) {
            inconsistencies.push({ file, type: 'Lógica', msg: `Año ${year} corresponde al S.${expectedCentury}, pero dice ${century}` });
        }
    } else {
        inconsistencies.push({ file, type: 'Estructura', msg: 'Fin de nombre inesperado tras el año (falta siglo)' });
    }

    // Check Reign (Next next part)
    if (yearIndex + 2 < parts.length) {
        const reign = parts[yearIndex + 2];
        const possibleReigns = yearReignMap.filter(p => year >= p.start && year <= p.end);

        if (possibleReigns.length > 0) {
            const match = possibleReigns.some(p => p.matches.includes(reign));
            if (!match) {
                const suggestions = possibleReigns.map(p => p.matches.join(" o ")).join(" / ");
                inconsistencies.push({ file, type: 'Reinado', msg: `Para el año ${year} se espera: ${suggestions}. Encontrado: '${reign}'` });
            }
        }
    }
});

fs.writeFileSync('analysis_report.json', JSON.stringify(inconsistencies, null, 2));
console.log("Reporte guardado en analysis_report.json");
