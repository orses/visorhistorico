# Visor Histórico de Madrid

Aplicación web profesional para la catalogación, visualización geográfica y análisis estadístico de colecciones de imágenes históricas.

![Estado del Proyecto](https://img.shields.io/badge/Estado-Producción-success)
![Tecnologías](https://img.shields.io/badge/Tecnologías-Vite%20%7C%20Leaflet%20%7C%20Chart.js%20%7C%20IndexedDB-blue)

## 🚀 Características Principales

### 🗺️ Mapa Inteligente y Geo-análisis
- **Clustering de Marcadores**: Agrupación dinámica de puntos cercanos para mejorar la legibilidad y el rendimiento.
- **Filtros Geográficos**: Búsqueda por radio de proximidad o por distritos/polígonos predefinidos.
- **Edición Geo-visual**: Posicionamiento mediante arrastrar y soltar con actualización en tiempo real.

### 🔍 Motor de Búsqueda Avanzado
- **Lógica Booleana**: Soporte para operadores `AND`, `OR`, `NOT` (y sus equivalentes en español `Y`, `O`, `NO`) para consultas complejas.
- **Búsquedas Exactas**: Soporte para frases literales entre comillas (`"..."` o `«...»`).

### 📊 Análisis y Estadísticas
- **Visualización de Datos**: Gráficos interactivos generados con **Chart.js**.
- **Distribuciones**: Análisis automático por tipo de documento y volumen cronológico por siglos.

### 🛠️ Herramientas de Gestión en Lote
- **Multi-selección**: Selección de múltiples elementos mediante `Shift` o `Ctrl`.
- **Edición Masiva**: Panel dedicado para aplicar metadatos comunes a cientos de registros simultáneamente.

### 💾 Arquitectura y Rendimiento
- **IndexedDB**: Almacenamiento persistente de alta capacidad.
- **Web Workers**: Decodificación de archivos TIFF pesados en segundo plano sin bloquear la interfaz.
- **PWA (Progressive Web App)**: Capacidad de ejecución offline y acceso rápido desde el escritorio.

---

## 🛠️ Instalación y Desarrollo

Este proyecto utiliza el empaquetador moderno **Vite**.

1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Iniciar servidor de desarrollo**:
   ```bash
   npm run dev
   ```

3. **Construir para producción**:
   ```bash
   npm run build
   ```

## 📖 Manual de Usuario Rápido

1. **Carga de Datos**: Haz clic en el botón «Cargar Directorio» y selecciona tu carpeta de imágenes.
2. **Navegación**: Usa las flechas del teclado (⬅️ / ➡️) para moverte entre fotos en el visor a pantalla completa.
3. **Guardado**: Los cambios se guardan automáticamente en la base de datos local (IndexedDB). Usa `Ctrl+G` para forzar un guardado o exportar a JSON.

## 📄 Licencia
Este proyecto se distribuye para uso en investigación histórica y archivística.

