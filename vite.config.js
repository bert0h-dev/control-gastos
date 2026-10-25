import { defineConfig } from 'vite';
import { apiMiddleware } from './server/api.js';

// La API con SQLite corre dentro del servidor de Vite: `npm run dev` y `npm run preview` no necesitan otro proceso
const sqliteApi = () => ({
  name: 'api-sqlite',
  configureServer(server){ server.middlewares.use(apiMiddleware()); },
  configurePreviewServer(server){ server.middlewares.use(apiMiddleware()); },
});

export default defineConfig({
  plugins: [sqliteApi()],
  test: { include: ['tests/**/*.test.js'] },
});
