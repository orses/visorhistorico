// ===== MOTOR DE BÚSQUEDA =====

export default class SearchEngine {
    constructor(metadataManager) {
        this.metadataManager = metadataManager;
    }

    // Normalizar texto (quitar acentos, minúsculas)
    normalize(str) {
        return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    }

    // Buscar en los metadatos con lógica Booleana (AND, OR, NOT)
    search(query) {
        if (!query) return [];

        // Soportar espacios como AND implícito ("A B" -> "A AND B") si no hay operadores explícitos entre palabras sueltas.
        // Paso 1: Normalizar mayúsculas de operadores
        let q = query.replace(/\b(y|and)\b/gi, ' AND ')
                     .replace(/\b(o|or)\b/gi, ' OR ')
                     .replace(/\b(no|not)\b/gi, ' NOT ');

        // Paso 2: Dividir por OR (cada grupo es una condición válida independiente)
        const orGroups = q.split(' OR ').map(g => g.trim()).filter(Boolean);

        // Paso 3: Parsear los términos END dentro de cada grupo OR
        const parsedGroups = orGroups.map(groupStr => {
            const terms = [];
            // Dividir por espacios respetando comillas ("una frase" o «una frase»)
            const termRegex = /(NOT\s+)?"[^"]+"|(?:\bNOT\s+)?«[^»]+»|(?:\bNOT\s+)?[^\s"]+/gi;
            let match;
            
            while ((match = termRegex.exec(groupStr)) !== null) {
                let token = match[0].trim();
                if (token === 'AND') continue; // Ignorar la palabra clave AND en sí misma si quedó residual

                let isNot = false;
                
                // Evaluar si tiene prefijo NOT o "-"
                if (token.toUpperCase().startsWith('NOT ')) {
                    isNot = true;
                    token = token.substring(4).trim();
                } else if (token.startsWith('-')) {
                    isNot = true;
                    token = token.substring(1).trim();
                }

                // Quitar comillas
                if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith('«') && token.endsWith('»'))) {
                    token = token.substring(1, token.length - 1);
                }

                if (token) {
                    terms.push({
                        term: this.normalize(token),
                        isNot: isNot
                    });
                }
            }
            return terms;
        });

        const allMetadata = this.metadataManager.getAllMetadata();
        const results = [];

        for (const [filename, meta] of Object.entries(allMetadata)) {
            // Construir texto buscable
            const searchableText = this.normalize([
                filename, // Incluir nombre de archivo
                meta.mainSubject,
                meta.location,
                meta.city,
                meta.author,
                meta.reign, // Include Character/Reign
                meta.dateRange?.start?.toString(), // Include Start Year
                meta.dateRange?.end?.toString(), // Include End Year
                meta.notes,
                ...(meta.tags || []),
                ...(meta.centuries || [])
            ].filter(Boolean).join(' '));

            // Evaluar grupos (OR): Al menos un grupo debe ser verdadero
            const isMatch = parsedGroups.some(groupConditions => {
                // Evaluar condiciones del grupo (AND): Todas deben cumplirse
                return groupConditions.every(cond => {
                    // Siempre búsqueda parcial para mayor flexibilidad
                    const matches = searchableText.includes(cond.term);
                    return cond.isNot ? !matches : matches;
                });
            });

            if (isMatch) {
                results.push({ filename, ...meta });
            }
        }

        return results;
    }
}
