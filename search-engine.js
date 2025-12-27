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

        // Pre-procesamiento de operadores en español e inglés
        // Paso 1: Unificar OR
        let q = query.replace(/\s+O\s+/g, ' OR ');

        // Paso 2: Unificar AND (Y, AND) -> espacio
        q = q.replace(/\s+Y\s+/g, ' ').replace(/\s+AND\s+/g, ' ');

        // Paso 3: Unificar NOT (NO, NOT) -> prefijo "-"
        // Reemplaza " NO " por " -" y " NOT " por " -"
        // También handle al inicio del string
        q = q.replace(/(^|\s)NO\s+/g, '$1-');
        q = q.replace(/(^|\s)NOT\s+/g, '$1-');

        const rawGroups = q.split(' OR ');

        // Parsear grupos: cada grupo es un OR (al menos uno debe cumplirse)
        // Dentro del grupo: espacios son AND, "-" es NOT
        // Soportamos frases literales entre " " o « »
        const parsedGroups = rawGroups.map(groupStr => {
            const terms = [];
            // Regex para capturar: -?"frase", -?«frase» o -?termino
            const termRegex = /(-?"[^"]+")|(-?«[^»]+»)|(-?\S+)/g;
            let match;
            while ((match = termRegex.exec(groupStr)) !== null) {
                terms.push(match[0]);
            }

            const conditions = terms.map(term => {
                let isNot = false;
                let cleanTerm = term;

                if (term.startsWith('-')) {
                    isNot = true;
                    cleanTerm = term.substring(1);
                }

                // Quitar comillas si existen al principio y al final
                if ((cleanTerm.startsWith('"') && cleanTerm.endsWith('"')) ||
                    (cleanTerm.startsWith('«') && cleanTerm.endsWith('»'))) {
                    cleanTerm = cleanTerm.substring(1, cleanTerm.length - 1);
                }

                return {
                    term: this.normalize(cleanTerm),
                    isNot: isNot
                };
            }).filter(c => c.term.length > 0);
            return conditions;
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
