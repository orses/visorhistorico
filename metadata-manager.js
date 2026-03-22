// ===== GESTOR DE METADATOS =====
import { get, set } from 'idb-keyval';
import logger from './modules/logger.js';

export default class MetadataManager {
    constructor() {
        this.metadata = {}; // Caché volátil de datos fusionados (Vivid Data)
        this.userDatabase = {}; // Capa 1: Base Maestra importada del JSON (Solo lectura en visor)
        this.manualEdits = {}; // Capa 2: Ediciones manuales del usuario (Persistentes)
        this.savingSuspended = false;

        // Optimización: Temporizador para guardado debounced
        this.saveTimeout = null;

        // Cachés de rendimiento
        this._normalizeCache = new Map();  // string → normalizedString
        this._parseCache = new Map();      // filename → parsedResult
        this._normalizedIndex = new Map(); // normalizedKey → originalKey (índice de userDatabase)
    }

    async init() {
        await this.loadFromStorage();
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
        if (this._normalizeCache.has(s)) return this._normalizeCache.get(s);
        const result = s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/^madrid\s*-\s*/, '')
            .replace(/\s+/g, ' ')
            .replace(/\.(jpg|jpeg|png|webp|tif|tiff|gif|bmp|svg)$/i, '')
            .trim();
        this._normalizeCache.set(s, result);
        return result;
    }

    // Parsear nombre de archivo según convención
    parseFilename(filename) {
        if (this._parseCache.has(filename)) return { ...this._parseCache.get(filename) };
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
                sourceUrl: null,
                authorUrl: null,
                fullPath: filename,
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
            sourceUrl: null,
            authorUrl: null,
            fullPath: filename,
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

        // Cachear resultado del parseo
        this._parseCache.set(filename, { ...metadata });
        return metadata;
    }

    // Método para optimizar y limpiar metadatos existentes
    optimizeMetadata() {
        let stats = { cleaned: 0, fixedAuthors: 0, fixedReigns: 0, removedBlobs: 0, fixedLocations: 0, fixedLicenses: 0 };
        logger.log("Iniciando optimización de metadatos...");

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

        logger.log("Optimización completada:", stats);
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
    /**
     * Construir el índice normalizado de la base de datos maestra.
     * Se llama una sola vez al importar o cargar userDatabase.
     */
    buildNormalizedIndex() {
        this._normalizedIndex.clear();
        for (const key of Object.keys(this.userDatabase)) {
            const norm = this.normalizeKey(key);
            if (norm) this._normalizedIndex.set(norm, key);
        }
        logger.log(`Índice normalizado construido: ${this._normalizedIndex.size} entradas`);
    }

    findInUserDatabase(filename) {
        if (!filename) return null;

        // 1. Coincidencia exacta de clave (O(1))
        if (this.userDatabase[filename]) {
            return this.userDatabase[filename];
        }

        // 2. Coincidencia normalizada vía índice (O(1))
        const normFilename = this.normalizeKey(filename);
        if (!normFilename) return null;

        const matchKey = this._normalizedIndex.get(normFilename);
        if (matchKey) {
            return this.userDatabase[matchKey];
        }

        // 3. Coincidencia por subcadena (fallback O(n), solo si no hay match directo)
        for (const [normKey, origKey] of this._normalizedIndex) {
            if (normKey.length > 3 && (normFilename.includes(normKey) || normKey.includes(normFilename))) {
                return this.userDatabase[origKey];
            }
        }

        return null;
    }

    // Aplicar los datos de la base de datos maestra a las entradas existentes (Fusión con Precedencia)
    applyUserDatabaseToExisting() {
        const filenames = Object.keys(this.metadata);
        filenames.forEach(filename => {
            this.getMetadata(filename); // Fuerza la fusión y actualización
        });
        this.saveToStorage();
    }

    // Obtener metadatos: Fusión Dinámica de Triple Capa con Caché
    getMetadata(filename) {
        // Si ya está en caché y es válida, devolverla
        if (this.metadata[filename] && this.metadata[filename]._isCacheValid) {
            return this.metadata[filename];
        }

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

        // Preservar datos efímeros de sesión (URLs de blobs, etc.) que están en la caché metadata antigua
        if (this.metadata[filename]) {
            fused._previewUrl = this.metadata[filename]._previewUrl || fused._previewUrl;
            fused._fileSize = this.metadata[filename]._fileSize || fused._fileSize;
        }

        // Marcar caché como válida
        fused._isCacheValid = true;

        // Actualizar caché volátil
        this.metadata[filename] = fused;
        return fused;
    }

    /**
     * Limpia todo el estado para comenzar de cero con un nuevo directorio.
     * Conserva las ediciones manuales en memoria pero las borra del IDB también.
     */
    async resetForNewDirectory() {
        // Revocar blob URLs existentes
        for (const key of Object.keys(this.metadata)) {
            const url = this.metadata[key]?._previewUrl;
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        }
        this.metadata = {};
        this.userDatabase = {};
        this.manualEdits = {};
        this._normalizeCache.clear();
        this._parseCache.clear();
        this.buildNormalizedIndex();
        // Borrar ediciones manuales persistidas en IDB
        try {
            const { del } = await import('idb-keyval');
            await del('coleccion_historia_edits_manuales');
        } catch (_) {}
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

        // Forzar re-calculado de la caché volátil invalidándola
        if (this.metadata[filename]) {
            this.metadata[filename]._isCacheValid = false;
        }
        this.getMetadata(filename);

        this.saveToStorage();
        return this.metadata[filename];
    }

    // Guardar datos volátiles (como _previewUrl o _fileSize) sin ensuciar la base de datos de usuario persistente
    setVolatileData(filename, data) {
        if (!this.metadata[filename]) {
            this.getMetadata(filename);
        }
        Object.assign(this.metadata[filename], data);
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

    // Guardar en IndexedDB con Debounce (Máximo rendimiento al editar)
    saveToStorage() {
        if (this.savingSuspended) return;

        if (this.saveTimeout) clearTimeout(this.saveTimeout);

        this.saveTimeout = setTimeout(async () => {
            try {
                // PERSISTIMOS SOLO LAS EDICIONES MANUALES
                const cleanManual = {};
                for (const key in this.manualEdits) {
                    const { _previewUrl, _fileSize, _isCacheValid, ...rest } = this.manualEdits[key];
                    cleanManual[key] = rest;
                }
                await set('coleccion_historia_edits_manuales', cleanManual);
                logger.log('Ediciones manuales persistidas en IDB (Debounced).');
            } catch (e) {
                logger.error('Error al guardar ediciones manuales:', e);
            }
        }, 1000); // 1 segundo de calma antes de escribir en disco
    }

    // Guardar la Base de Datos Maestra (Solo se llama cuando cambia de verdad)
    async saveUserDatabase() {
        try {
            await set('coleccion_historia_user_db', this.userDatabase);
            logger.log('Base de Datos Maestra persistida en IDB.');
        } catch (e) {
            logger.error('Error al guardar la base maestra:', e);
        }
    }

    // Cargar desde IndexedDB (con soporte legado para localStorage)
    async loadFromStorage() {
        try {
            // 1. Cargar Ediciones Manuales (Capa Nueva)
            const edits = await get('coleccion_historia_edits_manuales');
            if (edits) {
                this.manualEdits = edits;
                // MIGRACIÓN: marcar coordenadas preexistentes como de usuario
                // (anteriores a la flag _userCoords, que fueron puestas manualmente)
                let migrated = false;
                for (const key in this.manualEdits) {
                    const entry = this.manualEdits[key];
                    if (entry.coordinates && entry._userCoords !== true) {
                        entry._userCoords = true;
                        migrated = true;
                    }
                }
                if (migrated) {
                    await set('coleccion_historia_edits_manuales', this.manualEdits);
                    logger.log('Migración _userCoords completada');
                }
            } else {
                // MIGRACIÓN: Si no hay ediciones nuevas, intentar recuperar de localStorage
                const storedEdits = localStorage.getItem('coleccion_historia_edits_manuales');
                if (storedEdits) {
                    this.manualEdits = JSON.parse(storedEdits);
                    await set('coleccion_historia_edits_manuales', this.manualEdits);
                } else {
                    const oldStored = localStorage.getItem('coleccion_historia_metadata');
                    if (oldStored) {
                        const oldMetadata = JSON.parse(oldStored);
                        logger.log('Migrando datos del almacén antiguo...');
                        for (const key in oldMetadata) {
                            // Solo migramos si parecen datos de usuario o tienen coordenadas/notas
                            const item = oldMetadata[key];
                            if (item._isUserMetadata || item.coordinates || item.notes) {
                                this.manualEdits[key] = item;
                            }
                        }
                        await set('coleccion_historia_edits_manuales', this.manualEdits);
                    }
                }
            }

            // 2. Cargar Base de Datos Maestra (JSON)
            const userDb = await get('coleccion_historia_user_db');
            if (userDb) {
                this.userDatabase = userDb;
            } else {
                const storedDb = localStorage.getItem('coleccion_historia_user_db');
                if (storedDb) {
                    this.userDatabase = JSON.parse(storedDb);
                    await set('coleccion_historia_user_db', this.userDatabase);
                }
            }
            this.buildNormalizedIndex();

            logger.log('Datos cargados:', Object.keys(this.manualEdits).length, 'ediciones manuales,', Object.keys(this.userDatabase).length, 'entradas maestras.');
        } catch (e) {
            logger.error('Error al cargar datos IDB:', e);
            this.manualEdits = {};
            this.userDatabase = {};
            this.buildNormalizedIndex();
        }
    }

    // Exportar a JSON
    exportToJSON(filenames = null) {
        // Crear copia limpia sin _previewUrl
        const cleanMetadata = {};
        const keys = filenames ? filenames : Object.keys(this.metadata);
        for (const key of keys) {
            if (!this.metadata[key]) continue;
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

    // Validar una entrada individual del JSON importado
    validateImportedEntry(val) {
        if (!val || typeof val !== 'object') return false;
        if (val.dateRange !== undefined) {
            if (typeof val.dateRange !== 'object') return false;
            const { start, end } = val.dateRange;
            if (start !== undefined && start !== null && typeof start !== 'number') return false;
            if (end !== undefined && end !== null && typeof end !== 'number') return false;
        }
        if (val.coordinates !== undefined && val.coordinates !== null) {
            const { lat, lng } = val.coordinates;
            if (typeof lat !== 'number' || typeof lng !== 'number') return false;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        }
        if (val.centuries !== undefined && !Array.isArray(val.centuries)) return false;
        if (val.tags !== undefined && !Array.isArray(val.tags)) return false;
        return true;
    }

    // Importar desde JSON y establecer como Base de Datos Maestra
    importFromJSON(jsonData) {
        try {
            const imported = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
                logger.error('importFromJSON: datos inválidos');
                return false;
            }

            // 1. Actualizar la base de datos maestra
            this.userDatabase = {}; // Limpiamos la anterior si se desea un reemplazo total por este nuevo JSON
            let count = 0;
            for (const [key, val] of Object.entries(imported)) {
                if (!this.validateImportedEntry(val)) {
                    logger.warn(`importFromJSON: saltando entrada inválida: "${key}"`);
                    continue;
                }
                // Eliminar campos volátiles que no deben persistir en userDatabase
                const { _previewUrl, _fileSize, _isCacheValid, ...cleanVal } = val;
                cleanVal._isUserMetadata = true;
                // Las coordenadas del JSON se tratan siempre como puestas por el usuario
                if (cleanVal.coordinates) {
                    cleanVal._userCoords = true;
                }
                this.userDatabase[key] = cleanVal;
                count++;
            }

            this.buildNormalizedIndex();

            logger.log(`importFromJSON: ${count} entradas cargadas en userDatabase`);

            // 2. Disparar sincronización inmediata con los archivos ya cargados en el visor
            // Invalidar toda la caché para forzar re-fusión con el nuevo JSON
            Object.values(this.metadata).forEach(m => m._isCacheValid = false);
            this.applyUserDatabaseToExisting();
            this.saveUserDatabase(); // Guardar la DB maestra solo aquí

            logger.log('Base de Datos Maestra actualizada e integrada.');
            return true;
        } catch (e) {
            logger.error('Error al importar:', e);
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

}
