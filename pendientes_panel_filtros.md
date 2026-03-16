# Incidencias en el Panel de Navegación y Filtros

Este documento registra los problemas detectados en la interfaz del visor y su estado de resolución.

## Resumen de incidencias

### 1. Gestión del espacio y visibilidad
- ~~**Obstrucción de la galería**: El panel de navegación ocupa demasiado espacio, obligando a cerrar manualmente todos los filtros para poder visualizar la galería de imágenes.~~ ✅ **Resuelto**: los filtros ahora se ocultan/muestran como bloque completo con transición suave (`#filtersCollapsible`).
- ~~**Modo expandido ineficiente**: Al expandir la galería, los filtros (incluso cuando están contraídos) siguen ocupando espacio crítico, impidiendo una visión clara de los resultados.~~ ✅ **Resuelto**: al expandir la galería, los filtros se ocultan automáticamente.

### 2. Comportamiento de los controles
- ~~**Botón de mostrar/ocultar filtros**: El botón encargado de esta funcionalidad en el panel presenta un funcionamiento errático o incorrecto.~~ ✅ **Resuelto**: lógica unificada en un solo handler que gestiona `#filtersCollapsible.collapsed`.
- ~~**Funcionalidad del «ojo»**: El icono del ojo, destinado a mostrar u ocultar filtros en la vista de galería, no realiza ninguna acción.~~ ✅ **Resuelto**: botón rediseñado con icono de filtro (embudo) y funcionalidad correcta.
- ~~**Reinicio de filtros**: Al seleccionar una imagen y aplicar una propiedad, el estado de los filtros se reinicia inesperadamente, perdiendo la selección del usuario.~~ ✅ **Resuelto**: `refreshUI()` ya no destruye el DOM de filtros; utiliza `updateCounts()` para actualizar solo los contadores.

### 3. Problemas de diseño y maquetación (Layout)
- ~~**Solapamiento de textos**: Las etiquetas y números de «catalogados» y «resultados» aparecen excesivamente pegados, dificultando su lectura.~~ ✅ **Resuelto**: eliminado el duplicado de `.gallery-info` en CSS que causaba conflicto de estilos.
- ~~**Desbordamiento de elementos**: Los botones de «expandir», el icono del «ojo» y los números de paginación o visualización sobresalen de sus contenedores o se solapan incorrectamente.~~ ✅ **Resuelto**: añadido `flex-wrap` en `.view-controls-group` y extraídos los botones del grupo de columnas.

## Correcciones adicionales detectadas durante el análisis

- ✅ `GeographicFilter.renderSection()`: parámetros `label` y `group` estaban invertidos.
- ✅ `UIManager.renderMultiMetadataPanel()`: el select de tipo en edición en lote omitía «Infografía 3D», «Maqueta» y «Recreación Visual».
- ✅ `FilterManager.updateCounts()`: nuevo método para actualizar contadores sin destruir el DOM.

> [!NOTE]
> Se recomienda verificar visualmente en el navegador con un directorio de imágenes cargado.
