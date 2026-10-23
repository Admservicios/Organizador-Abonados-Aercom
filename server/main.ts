import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createWorkshopServer } from './app';
const dataDir =
  process.env.TALLER_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? homedir(), 'TallerCalamante');
const root = fileURLToPath(new URL('../', import.meta.url));
const webDir =
  process.env.TALLER_WEB_DIR ?? join(root, existsSync(join(root, 'web')) ? 'web' : 'dist');
const port = Number(process.env.TALLER_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('El puerto no es válido.');
const app = createWorkshopServer({
  dataDir: resolve(dataDir),
  webDir: resolve(webDir),
  port,
  publicOrigin: process.env.TALLER_PUBLIC_ORIGIN,
});
app.server.listen(port, '0.0.0.0', () =>
  console.log(`Taller Calamante disponible en http://127.0.0.1:${port}`),
);
app.server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
  app.database.close();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => {
      process.exitCode = 0;
    });
  });
