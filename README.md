# Gestor de Colección Histórica de Madrid

Aplicación web para gestionar, explorar y enriquecer la colección de imágenes históricas de Madrid.

## Características

### 📋 Gestión de Metadatos

- **Parser automático** de nombres de archivo
- **Editor visual completo** para cada grabado
- **Almacenamiento local** en el navegador
- **Exportación/importación** en JSON

### 🗺️ Mapa Interactivo

- **Visualización geográfica** de todos los grabados
- **Marcadores personalizados** por siglo
- **Coordenadas editables** por drag-and-drop
- **Popups con preview** de imagen

### 🔍 Búsqueda y Filtros

- **Búsqueda de texto** en todos los campos
- **Filtros por siglo, autor, fecha**
- **Combinación de filtros**
- **Filtros temporales** en timeline

### 🖼️ Galería

- **Vista de cuadrícula**
- **Vista de lista**
- **Visor fullscreen** de imágenes
- **Comparación lado a lado**

## Cómo usar

1. **Abrir la aplicación**: Abre `index.html` en tu navegador

2. **Primera vez**:
   - La aplicación escaneará automáticamente las imágenes del directorio padre
   - Los metadatos se generarán automáticamente desde los nombres de archivo
   - Puedes editar y enriquecer la información de cada grabado

3. **Editar metadatos**:
   - Haz clic en un grabado de la galería
   - Se abrirá el panel lateral con el editor
   - Modifica los campos deseados
   - Haz clic en «Guardar Cambios»

4. **Geolocalizar**:
   - Las ubicaciones conocidas se geolocalizan automáticamente
   - Puedes ajustar la posición arrastrando el marcador en el mapa
   - O editar las coordenadas manualmente en el formulario

5. **Buscar y filtrar**:
   - Usa la barra de búsqueda para texto libre
   - Haz clic en «Filtros avanzados» para criterios específicos
   - Usa los filtros de siglo en el timeline

6. **Exportar/Importar**:
   - **Exportar**: Botón «Exportar» descarga un JSON con todos los metadatos
   - **Importar**: Botón «Importar» carga metadatos desde un JSON previo

## Estructura de Datos

Los metadatos se almacenan en formato JSON con la siguiente estructura:

```json
{
  "nombre-archivo.jpg": {
    "filename": "nombre-archivo.jpg",
    "mainSubject": "Abundancia, fuente de la",
    "location": "Cebada, plaza de la de",
    "dateRange": {
      "start": 1624,
      "end": 1840
    },
    "centuries": ["XVII", "XVIII", "XIX"],
    "author": "Meunier, Luis",
    "coordinates": {
      "lat": 40.4089,
      "lng": -3.7081
    },
    "tags": ["fuente", "plaza"],
    "notes": "Notas adicionales..."
  }
}
```

## Tecnologías Utilizadas

- **HTML5/CSS3**: Estructura y diseño
- **JavaScript (Vanilla)**: Lógica de la aplicación
- **Leaflet.js**: Mapas interactivos
- **localStorage**: Almacenamiento local de metadatos

## Ubicaciones Predefinidas

El sistema reconoce automáticamente estas ubicaciones históricas de Madrid:

- Sol, puerta del
- Mayor, plaza
- Palacio Real
- Cebada, plaza de la de
- Alcalá, puerta de
- Toledo, puerta de
- Prado
- Retiro
- Oriente, plaza de
- España, plaza de
- Cibeles, plaza de

Cualquier otra ubicación se geocodificará al centro de Madrid por defecto.

## Notas Importantes

- Los metadatos se guardan en el navegador (localStorage)
- Usa la función de **exportar** regularmente para crear backups
- Las imágenes no se modifican nunca, solo sus metadatos
- Se recomienda usar navegadores modernos (Chrome, Firefox, Edge)

## Atajos de Teclado

- **Doble clic** en grabado: Abrir visor fullscreen
- **ESC**: Cerrar visor/modales
- **Click** en mapa: Seleccionar ubicación para nuevo grabado

## Ejecución recomendada en Windows 11

Desde la refactorización a módulos ES6 (`app.js` + imports), la aplicación
debe ejecutarse desde un servidor HTTP (no con `file://index.html`), para
evitar errores de CORS y de carga de módulos.

### Opción sencilla con Python

1. Instala Python 3.x desde <https://www.python.org/downloads/windows/>
2. Crea un archivo `server.bat` en la carpeta del proyecto con este contenido:

```bat
@echo off
cd /d "%~dp0"
python -m http.server 8000
```

3. Haz doble clic en `server.bat`.
4. Abre en el navegador: `http://localhost:8000/index.html`.

A partir de ahí, los módulos JavaScript (`app.js`, `metadata-manager.js`, etc.)
se cargarán correctamente y funcionarán los botones de carga de directorio,
importación/exportación y el resto de la aplicación.
