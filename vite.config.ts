import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'development-html-entry',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const url = new URL(request.url ?? '/', 'http://vite.local');
          const isNavigation = request.headers.accept?.includes('text/html');
          if (url.pathname === '/' || (isNavigation && !extname(url.pathname))) {
            request.url = `/app.html${url.search}`;
          }
          next();
        });
      },
    },
  ],
  build: {
    assetsDir: 'site-assets',
    rollupOptions: { input: fileURLToPath(new URL('./app.html', import.meta.url)) },
  },
});
