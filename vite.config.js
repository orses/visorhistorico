import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Plugin que bloquea eval() en el código fuente del proyecto
function noEvalPlugin() {
  return {
    name: 'no-eval',
    transform(code, id) {
      if (id.includes('node_modules')) return;
      if (/\beval\s*\(/.test(code)) {
        throw new Error(`[no-eval] Uso de eval() detectado en: ${id}`);
      }
    }
  };
}

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
  },
  base: './',
  plugins: [
    noEvalPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Visor Histórico de Madrid',
        short_name: 'Visor Histórico',
        description: 'Herramienta para catalogar y visualizar imágenes históricas.',
        theme_color: '#1a1a2e',
        background_color: '#0f0f1a',
        display: 'standalone',
        icons: []
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,json,png,jpg,svg}'],
        maximumFileSizeToCacheInBytes: 15000000 // Aumentado a 15MB para soportar mapas estáticos si los hubiera
      }
    })
  ]
});
