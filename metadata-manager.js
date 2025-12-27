// ===== GESTOR DE METADATOS =====

export default class MetadataManager {
    constructor() {
        this.metadata = {}; // Caché volátil de datos fusionados (Vivid Data)
        this.userDatabase = {}; // Capa 1: Base Maestra importada del JSON (Solo lectura en visor)
        this.manualEdits = {}; // Capa 2: Ediciones manuales del usuario (Persistentes)
        this.savingSuspended = false;
        this.loadFromStorage();
    }

    // Suspend auto-saving to localStorage
    suspendSave() {
        this.savingSuspended = true;
    }

    // Resume auto-saving and force a save
    resumeSave() {
        this.savingSuspended = false;
        this.saveToStorage();
    }

    // Normalización de claves para unificar nombres de archivo (insensible a tildes, prefijos, extensiones y espacios)
    normalizeKey(s) {
        if (!s) return '';
        return s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
            .replace(/^madrid\s*-\s*/, '') // Quitar prefijo Madrid
            .replace(/\s+/g, ' ') // Colapsar espacios
            .replace(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp|svg)$/i, '') // Quitar extensión
            .trim();
    }

    // Parsear nombre de archivo según convención
    parseFilename(filename) {
        let extractedAuthor = null;
        let authorSource = 'inference';
        let extractedLicense = null;
        let cleanName = filename;

        const isCopyright = (text) => {
            const lower = text.toLowerCase();
            return lower.startsWith('©') || lower.startsWith('(c)') || lower.startsWith('copyright') || lower.includes('©');
        };

        // 1. Detección de contenido entre corchetes [...]
        // Normalmente es Autor, pero si lleva Copyright, es Licencia/Fuente
        const bracketMatch = filename.match(/\[(.*?)\]/);
        if (bracketMatch) {
            const content = bracketMatch[1].trim();
            if (isCopyright(content)) {
                if (!extractedLicense) extractedLicense = content;
                else extractedLicense += '; ' + content;
            } else {
                extractedAuthor = content;
                authorSource = 'brackets';
            }
            cleanName = cleanName.replace(/\[.*?\]/, '');
        }

        // 2. Detección de contenido entre paréntesis (...)
        // Asumimos Licencia/Fuente salvo que sea fecha
        const parenMatches = filename.matchAll(/\((.*?)\)/g);
        for (const match of parenMatches) {
            const content = match[1].trim();
            // Check si es fecha o rango de fecha simple
            const isDate = /^\d{4}$/.test(content) || /^\d{4}\s*(a|-|to)\s*\d{4}$/.test(content);
            if (!isDate) { // Si no es fecha, es licencia
                if (!extractedLicense) extractedLicense = content;
                else extractedLicense += '; ' + content;

                const escaped = match[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                cleanName = cleanName.replace(new RegExp(escaped), '');
            } else {
                // Es fecha (ej: 1894-1937).
                // Si ya tenemos autor (de corchetes), asumimos que son fechas vitales del autor
                if (extractedAuthor) {
                    extractedAuthor += ' ' + match[0]; // Añadimos con paréntesis
                    const escaped = match[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    cleanName = cleanName.replace(new RegExp(escaped), '');
                }
                // Si no hay autor, dejamos la fecha ahí (podría ser la fecha de la imagen en formato (YYYY))
            }
        }

        // Limpieza final de guiones dobles y espacios
        cleanName = cleanName.replace(/\s+-\s+-\s+/g, ' - ').replace(/\s\s+/g, ' ').trim();

        // Formato: Ciudad - Objeto principal - Fecha - Siglo - Reino - Resto de objetos - Autor
        const parts = cleanName.replace(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp|svg)$/i, '').split(' - ');

        if (parts.length < 2) {
            return {
                filename,
                city: 'Desconocido',
                mainSubject: cleanName.replace(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp|svg)$/i, ''),
                location: null,
                dateRange: {},
                centuries: [],
                reign: null,
                author: extractedAuthor,
                _authorSource: authorSource,
                license: extractedLicense,
                secondarySubjects: [],
                tags: []
            };
        }

        const metadata = {
            filename,
            city: parts[0].trim(),
            mainSubject: parts[1] || '',
            location: parts[0].trim(), // Por defecto la ubicación es la ciudad
            dateRange: {},
            centuries: [],
            reign: null,
            author: extractedAuthor, // Asignar autor extraído por defecto
            _authorSource: authorSource,
            license: extractedLicense, // Nuevo campo
            secondarySubjects: [],
            tags: [],
            conservationStatus: 'Sin clasificar', // Estado de conservación (nuevo)
            type: null, // Fotografía, Grabado, Pintura, Texto, Dibujo
            notes: '',
            customFields: {}
        };

        // Lista de Reyes/Periodos para detección
        const knownReigns = [
            "Fernando I", "Sancho II", "Alfonso VI", "Urraca", "Alfonso VII",
            "Isabel I", "Fernando V", "Reyes Católicos", "Juana I", "Felipe I",
            "Carlos I", "Felipe II", "Felipe III", "Felipe IV", "Carlos II",
            "Felipe V", "Luis I", "Fernando VI", "Carlos III", "Carlos IV",
            "José I", "Fernando VII", "Isabel II",
            "Amadeo I",
            "Alfonso XII", "Alfonso XIII",
            "Segunda República", "Franco",
            "Juan Carlos I", "Felipe VI"
        ];

        // Detección de patrones
        const datePattern = /(\d{4})\s*a\s*(\d{4})/;
        const singleDatePattern = /(\d{4})/;
        const centuryPattern = /^(X{1,3}V?I{0,3})$/;

        for (const part of parts) {
            const p = part.trim();

            // 1. Fechas
            const dateMatch = p.match(datePattern);
            if (dateMatch) {
                metadata.dateRange = {
                    start: parseInt(dateMatch[1]),
                    end: parseInt(dateMatch[2])
                };
                continue;
            }
            const singleMatch = p.match(singleDatePattern);
            // Solo si es un año aislado (no parte de otro texto) y no tenemos fecha aun
            if (singleMatch && !metadata.dateRange.start && /^\d{4}$/.test(p)) {
                const year = parseInt(singleMatch[1]);
                metadata.dateRange = { start: year, end: year };
                continue;
            }

            // 2. Siglos
            // A veces vienen varios "XVII - XVIII" -> split by '-' is done, so we get "XVII" and "XVIII"
            // Pero nuestro split principal es ' - ', así que "XVII.jpg" o "XVIII" vendrían limpios.
            // Ojo: "1700 - XVIII"
            if (centuryPattern.test(p)) {
                metadata.centuries.push(p);
                continue;
            }

            // 3. Reinados
            if (knownReigns.includes(p)) {
                metadata.reign = p;
                continue; // Asumimos que es reinado y no otra cosa
            }
        }

        // Inferencia automática de siglos si hay fechas pero no siglos
        if (metadata.centuries.length === 0 && metadata.dateRange.start) {
            const startC = Math.ceil(metadata.dateRange.start / 100);
            const endC = metadata.dateRange.end ? Math.ceil(metadata.dateRange.end / 100) : startC;

            for (let c = startC; c <= endC; c++) {
                metadata.centuries.push(this.toRoman(c));
            }
        }

        // Detectar ubicación específica
        const locationIndex = parts.findIndex((p, index) =>
            index > 0 && (
                p.toLowerCase().includes('plaza') ||
                p.toLowerCase().includes('calle') ||
                p.toLowerCase().includes('puerta') ||
                p.toLowerCase().includes('palacio') ||
                p.toLowerCase().includes('paseo') ||
                p.toLowerCase().includes('ronda') ||
                p.toLowerCase().includes('rua') ||
                p.toLowerCase().includes('avenida') ||
                p.toLowerCase().includes('jardín') ||
                p.toLowerCase().includes('jardines') ||
                p.toLowerCase().includes('iglesia') ||
                p.toLowerCase().includes('convento') ||
                p.toLowerCase().includes('monasterio') ||
                p.toLowerCase().includes('carcel') ||
                p.toLowerCase().includes('cuartel') ||
                p.toLowerCase().includes('hospital') ||
                p.toLowerCase().includes('teatro') ||
                p.toLowerCase().includes('parque') ||
                p.toLowerCase().includes('fuente') ||
                p.toLowerCase().includes('estatua') ||
                p.toLowerCase().includes('monumento') ||
                p.toLowerCase().includes('arganzuela') ||
                p.toLowerCase().includes('chamberi') ||
                p.toLowerCase().includes('puente'))
        );

        if (locationIndex > 0) {
            metadata.location = parts[locationIndex];
        }

        // Generar etiquetas automáticas
        metadata.tags = this.generateAutoTags(metadata);

        return metadata;
    }

    // Método para optimizar y limpiar metadatos existentes
    optimizeMetadata() {
        let stats = { cleaned: 0, fixedAuthors: 0, fixedReigns: 0, removedBlobs: 0, fixedLocations: 0, fixedLicenses: 0 };
        console.log("Iniciando optimización de metadatos...");

        for (const filename of Object.keys(this.metadata)) {
            const meta = this.metadata[filename];
            let modified = false;

            // 1. Eliminar blobs inútiles
            if (false) { // Desactivado
                delete meta._previewUrl;
                modified = true;
                stats.removedBlobs++;
            }

            // 2. Re-parsear
            const freshParse = this.parseFilename(filename);

            // 2a. Arreglar Autor inválido o vacío
            const technicalTerms = ['colored', 'upscaled', 'comentario', 'copia', 'version', 'variante', '150dpi'];
            // Validar si es "realmente" invalido: es null, string vacío, solo espacios, o contiene términos técnicos
            const currentAuthorInvalid = !meta.author || !meta.author.trim() || technicalTerms.some(t => meta.author.toLowerCase().includes(t));

            // CRITERIO DE ACTUALIZACIÓN DE AUTOR (Refinado según solicitud de usuario):
            // SIEMPRE PREVALECEN LOS DATOS DEL JSON (si existen y son válidos).
            // Solo actualizamos si el actual es inválido/vacío.
            if (currentAuthorInvalid && freshParse.author && freshParse.author !== meta.author) {
                // Si es inválido, aceptamos el nuevo (venga de corchetes o inferencia)
                meta.author = freshParse.author;
                modified = true;
                stats.fixedAuthors++;
            }

            // 2b. Arreglar Ubicación sucia o vacía
            const locationDirty = meta.location && (meta.location.includes('[') || meta.location.includes(']'));
            const locationEmpty = !meta.location || !meta.location.trim();

            // Solo tocamos si está "sucia" (error de parseo antiguo) o vacía
            if (locationDirty) {
                if (freshParse.location && freshParse.location !== meta.location) {
                    meta.location = freshParse.location;
                    modified = true;
                    stats.fixedLocations++;
                }
            } else if (locationEmpty) {
                if (freshParse.location) {
                    meta.location = freshParse.location;
                    modified = true;
                    stats.fixedLocations++;
                }
            }

            // 2c. Arreglar Reinado faltante
            if ((!meta.reign || !meta.reign.trim()) && freshParse.reign) {
                meta.reign = freshParse.reign;
                modified = true;
                stats.fixedReigns++;
            }

            // 2d. Rellenar Siglos si faltan
            if ((!meta.centuries || meta.centuries.length === 0) && freshParse.centuries.length > 0) {
                meta.centuries = freshParse.centuries;
                modified = true;
            }

            // 2e. LICENCIA 
            // Solo si está vacío o contiene basura ("null", "undefined")
            const licenseInvalid = !meta.license || !meta.license.trim() || meta.license === 'null' || meta.license === 'undefined';
            if (licenseInvalid && freshParse.license) {
                meta.license = freshParse.license;
                modified = true;
                stats.fixedLicenses++;
            }

            if (modified) stats.cleaned++;
        }

        if (stats.cleaned > 0) {
            this.saveToStorage();
        }

        console.log("Optimización completada:", stats);
        return stats;
    }

    // Convertir número a romano (simple, para siglos)
    toRoman(num) {
        if (num < 1) return "";
        const romans = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
            "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];
        return romans[num] || num.toString();
    }

    // Generar etiquetas automáticas
    generateAutoTags(metadata) {
        const tags = [];

        const subject = metadata.mainSubject.toLowerCase();

        if (subject.includes('fuente')) tags.push('fuente');
        if (subject.includes('palacio')) tags.push('palacio');
        if (subject.includes('puerta')) tags.push('puerta');
        if (subject.includes('plaza')) tags.push('plaza');
        if (subject.includes('calle')) tags.push('calle');
        if (subject.includes('iglesia') || subject.includes('catedral')) tags.push('religioso');
        if (subject.includes('monasterio') || subject.includes('convento')) tags.push('religioso');

        // Añadir siglo como etiqueta
        if (metadata.centuries && metadata.centuries.length > 0) {
            metadata.centuries.forEach(c => tags.push(`siglo-${c}`));
        }

        return [...new Set(tags)]; // Eliminar duplicados
    }


    // Buscar en la base de datos maestra (JSON) con emparejamiento inteligente
    findInUserDatabase(filename) {
        if (!filename) return null;
        const normFilename = this.normalizeKey(filename);
        if (!normFilename) return null;

        // 1. Coincidencia exacta de clave (Prioridad absoluta)
        if (this.userDatabase[filename]) {
            // console.log(`findInUserDatabase: Coincidencia exacta para '${filename}'`);
            return this.userDatabase[filename];
        }

        // 2. Coincidencia normalizada exacta
        const allUserKeys = Object.keys(this.userDatabase);
        let matchKey = allUserKeys.find(key => this.normalizeKey(key) === normFilename);

        if (matchKey) {
            // console.log(`findInUserDatabase: Coincidencia normalizada '${filename}' -> '${matchKey}'`);
            return this.userDatabase[matchKey];
        }

        // 3. Coincidencia por subcadena (si el nombre del archivo contiene la clave del JSON "Apolo")
        if (!matchKey) {
            matchKey = allUserKeys.find(key => {
                const normUserKey = this.normalizeKey(key);
                // Si la clave del JSON está contenida en el nombre del archivo o viceversa
                return normUserKey && normUserKey.length > 3 && (normFilename.includes(normUserKey) || normUserKey.includes(normFilename));
            });

            if (matchKey) {
                // console.log(`findInUserDatabase: Coincidencia por subcadena '${filename}' -> '${matchKey}'`);
            }
        }

        if (!matchKey) {
            // Solo log en el primer archivo para evitar spam
            // console.log(`findInUserDatabase: Sin coincidencia para '${filename}' (normalizado: '${normFilename}')`);
        }

        return matchKey ? this.userDatabase[matchKey] : null;
    }

    // Aplicar los datos de la base de datos maestra a las entradas existentes (Fusión con Precedencia)
    applyUserDatabaseToExisting() {
        const filenames = Object.keys(this.metadata);
        filenames.forEach(filename => {
            this.getMetadata(filename); // Fuerza la fusión y actualización
        });
        this.saveToStorage();
    }

    // Obtener metadatos: Fusión Dinámica de Triple Capa
    getMetadata(filename) {
        // CAPA 0: INFERENCIA (Base del nombre del archivo en disco)
        const inferred = this.parseFilename(filename);

        // CAPA 1: BASE MAESTRA (JSON importado)
        const userData = this.findInUserDatabase(filename);
        let masterData = {};
        if (userData) {
            // Limpiamos campos vacíos para que no borren datos útiles de inferencia
            for (const k in userData) {
                if (userData[k] !== undefined && userData[k] !== null && userData[k] !== "") {
                    masterData[k] = userData[k];
                }
            }
        }

        // CAPA 2: EDICIONES MANUALES (Lo que el usuario ha cambiado en el visor)
        const manualData = this.manualEdits[filename] || {};

        // FUSIÓN JERÁRQUICA: Manual > Maestro > Inferencia
        const fused = {
            ...inferred,
            ...masterData,
            ...manualData
        };

        // Identificar si es dato de usuario (Maestro o Manual)
        if (userData || manualData._isUserMetadata || Object.keys(manualData).length > 0) {
            fused._isUserMetadata = true;
        }

        // Preservar datos efímeros de sesión (URLs de blobs, etc.) que están en la caché metadata
        if (this.metadata[filename]) {
            fused._previewUrl = this.metadata[filename]._previewUrl || fused._previewUrl;
            fused._fileSize = this.metadata[filename]._fileSize || fused._fileSize;
        }

        // Actualizar caché volátil
        this.metadata[filename] = fused;
        return fused;
    }

    // Actualizar metadatos: Alimenta la capa de EDICIONES MANUALES
    updateMetadata(filename, updates) {
        if (!this.manualEdits[filename]) {
            this.manualEdits[filename] = {};
        }

        // Aplicar los cambios a la capa manual
        Object.assign(this.manualEdits[filename], updates);

        // Marcar explícitamente como edición de usuario
        this.manualEdits[filename]._isUserMetadata = true;

        // Forzar re-calculado de la caché volátil
        this.getMetadata(filename);

        this.saveToStorage();
        return this.metadata[filename];
    }

    // Renombrar metadatos: Mueve también las ediciones manuales
    renameMetadata(oldName, newName) {
        // Renombrar en caché
        if (this.metadata[oldName]) {
            this.metadata[newName] = { ...this.metadata[oldName] };
            delete this.metadata[oldName];
        }

        // Renombrar en ediciones manuales (lo más importante)
        if (this.manualEdits[oldName]) {
            this.manualEdits[newName] = { ...this.manualEdits[oldName] };
            delete this.manualEdits[oldName];
        }

        this.saveToStorage();
        return true;
    }

    // Eliminar metadatos
    removeMetadata(filename) {
        let deleted = false;
        if (this.metadata[filename]) {
            delete this.metadata[filename];
            deleted = true;
        }
        if (this.manualEdits[filename]) {
            delete this.manualEdits[filename];
            deleted = true;
        }
        if (deleted) this.saveToStorage();
        return deleted;
    }

    // Obtener todos los metadatos
    getAllMetadata() {
        return this.metadata;
    }

    // Limpiar todos los metadatos
    clearAllMetadata() {
        this.metadata = {};
        this.saveToStorage();
    }

    // Guardar en localStorage
    saveToStorage() {
        if (this.savingSuspended) return;
        try {
            // PERSISTIMOS SOLO LAS EDICIONES MANUALES (La capa que el usuario creó en el visor)
            // No guardamos la caché 'metadata' completa porque se puede reconstruir fusionando.
            // Limpiamos de campos técnicos de sesión antes de guardar.
            const cleanManual = {};
            for (const key in this.manualEdits) {
                const { _previewUrl, _fileSize, ...rest } = this.manualEdits[key];
                cleanManual[key] = rest;
            }
            localStorage.setItem('coleccion_historia_edits_manuales', JSON.stringify(cleanManual));

            // Guardar Base de Datos Maestra (JSON) de forma independiente
            localStorage.setItem('coleccion_historia_user_db', JSON.stringify(this.userDatabase));

            console.log('Ediciones manuales y Base Maestra persistidas.');
        } catch (e) {
            console.error('Error al guardar datos:', e);
        }
    }

    // Cargar desde localStorage
    loadFromStorage() {
        try {
            // 1. Cargar Ediciones Manuales (Capa Nueva)
            const storedEdits = localStorage.getItem('coleccion_historia_edits_manuales');
            if (storedEdits) {
                this.manualEdits = JSON.parse(storedEdits);
            } else {
                // MIGRACIÓN: Si no hay ediciones nuevas, intentar recuperar del almacén antiguo
                const oldStored = localStorage.getItem('coleccion_historia_metadata');
                if (oldStored) {
                    const oldMetadata = JSON.parse(oldStored);
                    console.log('Migrando datos del almacén antiguo...');
                    for (const key in oldMetadata) {
                        // Solo migramos si parecen datos de usuario o tienen coordenadas/notas
                        const item = oldMetadata[key];
                        if (item._isUserMetadata || item.coordinates || item.notes) {
                            this.manualEdits[key] = item;
                        }
                    }
                    this.saveToStorage(); // Persistir en el nuevo formato
                }
            }

            // 2. Cargar Base de Datos Maestra (JSON)
            const storedDb = localStorage.getItem('coleccion_historia_user_db');
            if (storedDb) this.userDatabase = JSON.parse(storedDb);

            console.log('Datos cargados:', Object.keys(this.manualEdits).length, 'ediciones manuales,', Object.keys(this.userDatabase).length, 'entradas maestras.');
        } catch (e) {
            console.error('Error al cargar datos:', e);
            this.manualEdits = {};
            this.userDatabase = {};
        }
    }

    // Exportar a JSON
    exportToJSON() {
        // Crear copia limpia sin _previewUrl
        const cleanMetadata = {};
        for (const key in this.metadata) {
            const { _previewUrl, ...rest } = this.metadata[key];
            cleanMetadata[key] = rest;
        }
        const dataStr = JSON.stringify(cleanMetadata, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `coleccion-historia-metadata_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        URL.revokeObjectURL(url);
    }

    // Importar desde JSON y establecer como Base de Datos Maestra
    importFromJSON(jsonData) {
        try {
            const imported = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            if (!imported || typeof imported !== 'object') {
                console.error('importFromJSON: datos inválidos');
                return false;
            }

            // 1. Actualizar la base de datos maestra
            this.userDatabase = {}; // Limpiamos la anterior si se desea un reemplazo total por este nuevo JSON
            let count = 0;
            for (const [key, val] of Object.entries(imported)) {
                if (val && typeof val === 'object') {
                    val._isUserMetadata = true;
                    this.userDatabase[key] = val;
                    count++;
                }
            }

            console.log(`importFromJSON: ${count} entradas cargadas en userDatabase`);
            console.log('Primer entrada:', Object.keys(this.userDatabase)[0]);
            console.log('Datos primera entrada:', this.userDatabase[Object.keys(this.userDatabase)[0]]);

            // 2. Disparar sincronización inmediata con los archivos ya cargados en el visor
            this.applyUserDatabaseToExisting();

            console.log('Base de Datos Maestra actualizada e integrada.');
            return true;
        } catch (e) {
            console.error('Error al importar:', e);
            return false;
        }
    }


    // Filtrar metadatos
    filter(criteria) {
        const results = [];

        for (const [filename, meta] of Object.entries(this.metadata)) {
            let matches = true;

            // Filtro por autor
            if (criteria.author && meta.author !== criteria.author) {
                matches = false;
            }

            // Filtro por siglos
            if (criteria.centuries && criteria.centuries.length > 0) {
                const hasCentury = meta.centuries.some(c => criteria.centuries.includes(c));
                if (!hasCentury) matches = false;
            }

            // Filtro por rango de fechas
            if (criteria.startYear && meta.dateRange.start < criteria.startYear) {
                matches = false;
            }
            if (criteria.endYear && meta.dateRange.end > criteria.endYear) {
                matches = false;
            }

            // Filtro por etiquetas
            if (criteria.tags && criteria.tags.length > 0) {
                const hasTag = criteria.tags.some(t => meta.tags.includes(t));
                if (!hasTag) matches = false;
            }

            // Filtro por tipo de documento
            if (criteria.type && meta.type !== criteria.type) {
                matches = false;
            }

            if (matches) {
                results.push({ filename, ...meta });
            }
        }

        return results;
    }

    // Obtener lista única de autores
    getAuthors() {
        const authors = new Set();
        Object.values(this.metadata).forEach(meta => {
            if (meta.author) authors.add(meta.author);
        });
        return Array.from(authors).sort();
    }

    // Obtener lista única de siglos
    getCenturies() {
        const centuries = new Set();
        Object.values(this.metadata).forEach(meta => {
            if (meta.centuries) {
                meta.centuries.forEach(c => centuries.add(c));
            }
        });
        return Array.from(centuries).sort();
    }

    // Obtener lista única de etiquetas
    getTags() {
        const tags = new Set();
        Object.values(this.metadata).forEach(meta => {
            if (meta.tags) {
                meta.tags.forEach(t => tags.add(t));
            }
        });
        return Array.from(tags).sort();
    }

    // Geocodificación básica de ubicaciones conocidas de Madrid
    getCoordinates(location, city = 'Madrid') {
        if (!location) return null;

        // Si la ciudad NO es Madrid (y no está vacía), no intentar geocodificar en Madrid
        // Esto evita que "Palacio Real" en Aranjuez se ubique en Madrid
        if (city && !city.toLowerCase().includes('madrid') && city.trim() !== '') {
            return null;
        }

        const loc = location.toLowerCase().replace(/^madrid\s*-\s*/, '');

        const knownLocations = {
            'Sol, puerta del': { lat: 40.4169, lng: -3.7033 },
            'Puerta del Sol': { lat: 40.4169, lng: -3.7033 },
            'Mayor, plaza': { lat: 40.4155, lng: -3.7074 },
            'Plaza Mayor': { lat: 40.4155, lng: -3.7074 },
            'Palacio Real': { lat: 40.4180, lng: -3.7143 },
            'Real, palacio': { lat: 40.4180, lng: -3.7143 },
            'Cebada, plaza de la de': { lat: 40.4089, lng: -3.7081 },
            'Alcalá, puerta de': { lat: 40.4201, lng: -3.6885 },
            'Puerta de Alcalá': { lat: 40.4201, lng: -3.6885 },
            'Toledo, puerta de': { lat: 40.4065, lng: -3.7085 },
            'Puerta de Toledo': { lat: 40.4065, lng: -3.7085 },
            'Prado': { lat: 40.4138, lng: -3.6921 },
            'Retiro': { lat: 40.4153, lng: -3.6844 },
            'Cibeles, plaza de': { lat: 40.4189, lng: -3.6936 },
            'Plaza de Cibeles': { lat: 40.4189, lng: -3.6936 },
            'Atocha, estación de': { lat: 40.4065, lng: -3.6915 },
            'Estación de Atocha': { lat: 40.4065, lng: -3.6915 },
            'Colón, plaza de': { lat: 40.4250, lng: -3.6903 },
            'España, plaza de': { lat: 40.4239, lng: -3.7122 },
            'Oriente, plaza de': { lat: 40.4180, lng: -3.7143 },
            'Callao, plaza de': { lat: 40.4197, lng: -3.7059 },
            'Cárcel de Corte': { lat: 40.4147, lng: -3.7056 },
            'Santa Cruz, palacio de': { lat: 40.4147, lng: -3.7056 },
            'San Gil, cuartel de': { lat: 40.423, lng: -3.712 },
            'San Gil, real monasterio de': { lat: 40.419, lng: -3.713 }
        };

        for (const [name, coords] of Object.entries(knownLocations)) {
            if (loc.includes(name.toLowerCase())) {
                return { ...coords };
            }
        }

        // Coordenadas por defecto (centro de Madrid) solo si estamos en contexto Madrid
        if (!city || city.toLowerCase().includes('madrid')) {
            return { lat: 40.4168, lng: -3.7038 };
        }

        return null;
    }
}
