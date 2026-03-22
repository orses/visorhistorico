// ===== MOTOR DE BÚSQUEDA =====

export default class SearchEngine {
    constructor(metadataManager) {
        this.metadataManager = metadataManager;
    }

    // Normalizar texto (quitar acentos, minúsculas)
    normalize(str) {
        return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    }

    // Parse field:value operator tokens from query, return { fieldFilters, remainingQuery }
    parseFieldOperators(query) {
        const aliases = {
            'siglo':        'centuries',
            'autor':        'author',
            'tipo':         'type',
            'ubicacion':    'location',
            'año':          'year',
            'conservacion': 'conservationStatus',
            'reinado':      'reign',
            'etiqueta':     'tags',
        };
        const fieldFilters = [];
        let remaining = query;

        const operatorRegex = /(\w+):(\S+)/gi;
        const matches = [...query.matchAll(operatorRegex)];
        for (const match of matches) {
            const alias = match[1].toLowerCase();
            const value = match[2];
            if (aliases[alias]) {
                fieldFilters.push({ field: aliases[alias], value: this.normalize(value) });
                remaining = remaining.replace(match[0], '').trim();
            }
        }

        return { fieldFilters, remainingQuery: remaining };
    }

    // Check if a metadata entry matches all field-level filters
    matchesFieldFilters(meta, fieldFilters) {
        for (const { field, value } of fieldFilters) {
            if (field === 'centuries') {
                const vals = (meta.centuries || []).map(c => this.normalize(c));
                if (!vals.some(v => v.includes(value))) return false;
            } else if (field === 'tags') {
                const vals = (meta.tags || []).map(t => this.normalize(t));
                if (!vals.some(v => v.includes(value))) return false;
            } else if (field === 'year') {
                const start = meta.dateRange?.start;
                const end = meta.dateRange?.end;
                const yr = parseInt(value);
                if (!isNaN(yr)) {
                    if (start && end) {
                        if (yr < start || yr > end) return false;
                    } else if (start) {
                        if (String(start) !== value && !this.normalize(String(start)).includes(value)) return false;
                    } else {
                        return false;
                    }
                }
            } else {
                const fieldVal = this.normalize(String(meta[field] || ''));
                if (!fieldVal.includes(value)) return false;
            }
        }
        return true;
    }

    // Buscar en los metadatos con lógica Booleana (AND, OR, NOT)
    search(query) {
        if (!query) return [];

        // Extract field operators before boolean parsing
        const { fieldFilters, remainingQuery } = this.parseFieldOperators(query);

        // If only field operators and no remaining text, return all matching field filters
        const allMetadata = this.metadataManager.getAllMetadata();

        if (!remainingQuery.trim()) {
            if (fieldFilters.length === 0) return [];
            const results = [];
            for (const [filename, meta] of Object.entries(allMetadata)) {
                if (this.matchesFieldFilters(meta, fieldFilters)) {
                    results.push({ filename, ...meta });
                }
            }
            return results;
        }

        // Soportar espacios como AND implícito ("A B" -> "A AND B") si no hay operadores explícitos entre palabras sueltas.
        // Paso 1: Normalizar mayúsculas de operadores
        let q = remainingQuery.replace(/\b(y|and)\b/gi, ' AND ')
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

        const results = [];

        for (const [filename, meta] of Object.entries(allMetadata)) {
            // Apply field-level filters first
            if (fieldFilters.length > 0 && !this.matchesFieldFilters(meta, fieldFilters)) {
                continue;
            }

            // Usar texto pre-computado si está disponible (worker), o construirlo ahora
            const searchableText = meta._searchableText ?? this.normalize([
                filename,
                meta.mainSubject,
                meta.location,
                meta.city,
                meta.author,
                meta.reign,
                meta.dateRange?.start?.toString(),
                meta.dateRange?.end?.toString(),
                meta.notes,
                ...(meta.tags     || []),
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
