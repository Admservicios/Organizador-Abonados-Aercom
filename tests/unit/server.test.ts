import { networkInterfaces } from 'node:os';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createWorkshopServer, privateAddress } from '../../server/app';
import { emptyData } from '../../src/lib/localDatabase';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { prepareDocument } from '../../src/lib/documents';
import { parsePhotoBackup } from '../../src/lib/photoBackup';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function start() {
  const dir = await mkdtemp(join(tmpdir(), 'calamante-server-unit-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const web = join(dir, 'web');
  await mkdir(web);
  await writeFile(join(web, 'index.html'), '<html><head></head><body>App</body></html>');
  const app = createWorkshopServer({ dataDir: join(dir, 'data'), webDir: web, port: 0 });
  await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
  cleanups.push(() => app.close());
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const request = (path: string, options: RequestInit = {}) =>
    fetch(base + path, { ...options, headers: { Origin: base, ...options.headers } });
  const response = await request('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'Clave-de-prueba-taller' }),
  });
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const authenticated = (path: string, options: RequestInit = {}) =>
    request(path, { ...options, headers: { Cookie: cookie, ...options.headers } });
  return { dir, app, base, request, authenticated, cookie };
}
const privateIP = Object.values(networkInterfaces())
  .flatMap((rows) => rows ?? [])
  .find((row) => row.family === 'IPv4' && privateAddress(row.address))?.address;
describe('servidor privado SQLite del taller', () => {
  it.skipIf(!privateIP)(
    'exige habilitar la red en conexiones con dirección de origen privada',
    async () => {
      const { base, authenticated, cookie } = await start();
      const remote = () =>
        new Promise<number>((resolve, reject) => {
          const req = httpRequest(
            base + '/api/state',
            { localAddress: privateIP!, headers: { Cookie: cookie } },
            (response) => {
              response.resume();
              resolve(response.statusCode!);
            },
          );
          req.on('error', reject);
          req.end();
        });
      expect(await remote()).toBe(403);
      expect(
        (
          await authenticated('/api/network', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
          })
        ).status,
      ).toBe(200);
      expect(await remote()).toBe(200);
    },
  );
  it('limita el acceso de red a direcciones privadas', () => {
    for (const ip of ['192.168.1.5', '10.0.0.1', '172.16.1.2', '::ffff:192.168.1.4'])
      expect(privateAddress(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '192.169.1.1', '10.2.999.1', undefined])
      expect(privateAddress(ip)).toBe(false);
  });
  it('protege los datos y archivos, verifica origen y no sirve la base como archivo', async () => {
    const { request, authenticated, base } = await start();
    expect((await request('/api/state')).status).toBe(401);
    expect((await request('/api/files/documents/set/id')).status).toBe(401);
    expect((await request('/taller.sqlite')).status).toBe(404);
    expect((await request('/%2e%2e/data/taller.sqlite')).status).toBe(404);
    expect(
      (
        await authenticated('/api/state', {
          method: 'PUT',
          headers: {
            Origin: 'https://otro.example',
            'Content-Type': 'application/json',
            'If-Match': '0',
          },
          body: JSON.stringify({ data: emptyData() }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await authenticated('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(428);
    const hostStatus = await new Promise<number>((resolve) => {
      const req = httpRequest(base, { headers: { Host: 'otro.example' } }, (response) => {
        response.resume();
        resolve(response.statusCode!);
      });
      req.end();
    });
    expect(hostStatus).toBe(403);
    const page = await request('/');
    expect(await page.text()).toContain('window.__TALLER_SERVER__=true');
  });
  it('guarda en SQLite, rechaza relaciones inválidas y conflictos entre dispositivos sin perder datos', async () => {
    const { app, authenticated } = await start();
    const data = { ...emptyData(), customers: [initialCustomers[0]] };
    const write = (revision: number, value: unknown) =>
      authenticated('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': String(revision) },
        body: JSON.stringify({ data: value }),
      });
    expect((await write(0, data)).status).toBe(200);
    expect(app.database.state().data.customers).toEqual(data.customers);
    expect((await write(0, { ...data, customers: [] })).status).toBe(409);
    expect(
      (await write(1, { ...data, vehicles: [{ ...initialVehicles[0], customerId: 'no-existe' }] }))
        .status,
    ).toBe(400);
    expect(app.database.state().revision).toBe(1);
    expect(app.database.state().data.customers).toEqual(data.customers);
    const previous = await authenticated('/api/backup?previous=1');
    expect(previous.status).toBe(200);
    expect(
      (await parsePhotoBackup(new Uint8Array(await previous.arrayBuffer()))).backup.data.customers,
    ).toEqual([]);
  });
  it('migra documentos originales junto a sus registros, conserva copias previas y revierte altas incompletas', async () => {
    const { app, authenticated, dir } = await start();
    const bytes = await readFile(new URL('../fixtures/documento-imagen.png', import.meta.url));
    const document = await prepareDocument(new File([bytes], 'cedula.png'), 'v1', 'Cédula');
    const { data: _blob, ...ref } = document;
    const setId = crypto.randomUUID();
    const data = {
      ...emptyData(),
      customers: initialCustomers,
      vehicles: initialVehicles,
      documentSet: setId,
      documents: [ref],
    };
    const metadata = { ...ref, setId };
    const write = (revision: number, value: unknown, uploads: unknown[] = []) =>
      authenticated('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': String(revision) },
        body: JSON.stringify({ data: value, uploads }),
      });
    expect((await write(0, data)).status).toBe(400);
    const partial = {
      ...data,
      documents: [...data.documents, { ...ref, id: crypto.randomUUID() }],
    };
    expect(
      (await write(0, partial, [{ kind: 'documents', metadata, bytes: bytes.toString('base64') }]))
        .status,
    ).toBe(400);
    expect(
      Number(app.database.db.prepare('SELECT count(*) AS count FROM assets').get()!.count),
    ).toBe(0);

    expect(app.database.state().revision).toBe(0);
    expect(
      (await write(0, data, [{ kind: 'documents', metadata, bytes: bytes.toString('base64') }]))
        .status,
    ).toBe(200);
    expect((await write(1, { ...data, documents: [{ ...ref, mime: 'image/jpeg' }] })).status).toBe(
      400,
    );
    const download = await authenticated(`/api/files/documents/${setId}/${ref.id}`);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    const backup = await authenticated('/api/backup');
    const parsed = await parsePhotoBackup(new Uint8Array(await backup.arrayBuffer()));
    expect(parsed.backup.data).toEqual(data);
    expect((await write(1, { ...data, documents: [] })).status).toBe(200);
    const previous = await authenticated('/api/backup?previous=1');
    const old = await parsePhotoBackup(new Uint8Array(await previous.arrayBuffer()));
    expect(Buffer.from(await old.documents[0].data.arrayBuffer())).toEqual(bytes);
    expect((await authenticated('/api/backup-now', { method: 'POST' })).status).toBe(200);
    const names = (await readdir(join(dir, 'data', 'backups'))).filter((name) =>
      name.endsWith('.zip'),
    );
    expect(names.length).toBeGreaterThan(0);
  });
  it('cierra la sesión y limita intentos de contraseña', async () => {
    const { authenticated, request } = await start();
    expect((await authenticated('/api/logout', { method: 'POST' })).status).toBe(200);
    expect((await authenticated('/api/state')).status).toBe(401);
    let response: Response | undefined;
    for (let i = 0; i < 9; i++)
      response = await request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'incorrecta' }),
      });
    expect(response!.status).toBe(429);
  });
});
