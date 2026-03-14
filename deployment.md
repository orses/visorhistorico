# Guía de Despliegue en GitHub Pages

Para que tu aplicación sea accesible públicamente desde internet usando GitHub Pages, sigue estos pasos:

## 1. Configuración Previa
Asegúrate de que en `vite.config.js` la propiedad `base` esté configurada como `./`:
```javascript
export default defineConfig({
  base: './',
  // ... resto de la configuración
});
```
(Ya lo he dejado configurado así para ti).

## 2. Preparación del Código
Ejecuta el comando de construcción en tu terminal:
```bash
npm run build
```
Esto generará una carpeta llamada `dist/` con todo el código optimizado, minificado y listo para producción.

## 3. Subida a GitHub
Sube los cambios a tu repositorio principal:
```bash
git add .
git commit -m "Preparación para despliegue"
git push origin main
```

## 4. Despliegue (Opción Recomendada: GitHub Actions)
La forma más profesional es usar una "Action" que construya y publique automáticamente:
1. En tu repositorio en GitHub, ve a **Settings > Pages**.
2. En **Build and deployment > Source**, selecciona **GitHub Actions**.
3. Haz clic en "Configure" en la sugerencia de "Static HTML" o busca un workflow de "Vite".

### Opción manual (Rápida pero menos limpia)
Si no quieres usar Actions, puedes instalar el paquete `gh-pages`:
1. `npm install --save-dev gh-pages`
2. Añade este script a tu `package.json`: `"deploy": "gh-pages -d dist"`
3. Ejecuta: `npm run build && npm run deploy`

## 5. Acceso
Una vez completado, tu web estará disponible en:
`https://tu-usuario.github.io/nombre-del-repositorio/`

> [!IMPORTANT]
> Recuerda que al ser una aplicación que maneja archivos locales, el usuario siempre deberá "Cargar Directorio" la primera vez que entre en la URL pública para conectar sus imágenes locales con la interfaz web.
