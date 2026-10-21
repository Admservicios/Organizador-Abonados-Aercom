import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
assert.equal(
  await readFile(resolve(root, 'index.html'), 'utf8'),
  await readFile(resolve(root, 'dist/index.html'), 'utf8'),
  'La raíz publicada está desactualizada. Ejecutar npm run publish:static antes de subir cambios.',
);
const mount = '/Organizador-Abonados-Aercom/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://test.local').pathname);
    const compiled = path.startsWith(`/compiled${mount}`);
    const prefix = compiled ? `/compiled${mount}` : mount;
    const base = compiled ? resolve(root, 'dist') : resolve(root);
    const relative = path.slice(prefix.length) || 'index.html';
    if (
      !path.startsWith(prefix) ||
      (relative !== 'index.html' && !relative.startsWith('site-assets/'))
    ) {
      response.writeHead(404).end();
      return;
    }
    const file = resolve(base, relative);
    if (!file.startsWith(base + sep)) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  });
  const port = server.address().port;
  for (const [name, path] of [
    ['Pages desde main', mount],
    ['Pages desde Actions', `/compiled${mount}`],
  ]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.url().includes('/site-assets/') && response.status() >= 400)
          errors.push(`Recurso ${response.status()}: ${response.url()}`);
      });
      const url = `http://127.0.0.1:${port}${path}`;
      assert.equal((await page.goto(url)).status(), 200);
      await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
      assert.match(await page.title(), /Taller Calamante/);
      assert.match(await page.locator('.sidebar .brand').innerText(), /Calamante/);
      await page.goto(`${url}#/clientes`);
      await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/Nombre y apellido/).fill('Cliente de prueba estática');
      await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
      await page.reload();
      await page.getByRole('button', { name: /^Cliente de prueba estática/ }).waitFor();
      await page.goto(`${url}#/publico/demo/v2`);
      await page.getByRole('heading', { name: 'Historial del vehículo', exact: true }).waitFor();
      assert.ok(!(await page.locator('body').innerText()).includes('Cliente de prueba estática'));
      assert.deepEqual(errors, [], `${name}: errores en el sitio servido sin Vite`);
      console.log(`${name}: Dashboard, rutas, recarga, persistencia y recursos correctos.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
