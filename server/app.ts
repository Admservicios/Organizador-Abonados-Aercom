import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { WorkshopDatabase, HttpError, writeSchema } from './database';

const isLocal = (ip: string | undefined) =>
  ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
export function privateAddress(value: string | undefined) {
  const parts = (value ?? '')
    .replace(/^::ffff:/, '')
    .split('.')
    .map(Number);
  return (
    parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 169 && parts[1] === 254))
  );
}
export function createWorkshopServer(options: {
  dataDir: string;
  webDir: string;
  port: number;
  publicOrigin?: string;
}) {
  if (options.publicOrigin) {
    const origin = new URL(options.publicOrigin);
    if (origin.protocol !== 'https:')
      throw new Error('El acceso externo requiere una dirección HTTPS.');
    options.publicOrigin = origin.origin;
  }
  const dataDir = resolve(options.dataDir),
    webDir = resolve(options.webDir);
  const database = new WorkshopDatabase(join(dataDir, 'taller.sqlite'));
  let backupBusy = false,
    backupError = '',
    lastBackup = database.setting('lastBackup') ?? '',
    lastRevision = Number(database.setting('lastBackupRevision') ?? -1);
  let stopping = false;
  const addresses = () => [
    '127.0.0.1',
    'localhost',
    ...Object.values(networkInterfaces()).flatMap((rows) =>
      (rows ?? [])
        .filter((n) => !n.internal && n.family === 'IPv4' && privateAddress(n.address))
        .map((n) => n.address),
    ),
  ];
  const attempts = new Map<string, { count: number; until: number }>();
  async function automaticBackup(force = false): Promise<void> {
    if (backupBusy && force) {
      while (backupBusy) await new Promise((resolve) => setTimeout(resolve, 20));
      return automaticBackup(true);
    }
    if (
      backupBusy ||
      stopping ||
      (!force &&
        (lastRevision === database.state().revision ||
          Date.now() - Date.parse(lastBackup || '1970-01-01') < 15 * 60 * 1000))
    )
      return;
    backupBusy = true;
    let temporary = '';
    try {
      const { revision, blob } = await database.backup();
      const bytes = Buffer.from(await blob.arrayBuffer());
      const directory = join(dataDir, 'backups');
      await mkdir(directory, { recursive: true });
      const name = `taller-calamante-${new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/[ :]/g, '-') + '-' + Date.now()}-r${revision}.zip`;
      temporary = join(directory, name + '.partial');
      await writeFile(temporary, bytes, { flag: 'wx' });
      if (
        createHash('sha256')
          .update(await readFile(temporary))
          .digest('hex') !== createHash('sha256').update(bytes).digest('hex')
      )
        throw new Error('No se pudo verificar la copia escrita.');
      await rename(temporary, join(directory, name));
      lastBackup = new Date().toISOString();
      lastRevision = revision;
      backupError = '';
      database.setSetting('lastBackup', lastBackup);
      database.setSetting('lastBackupRevision', String(revision));
    } catch {
      backupError =
        'No se pudo crear la copia automática. Revisá el espacio de la PC y descargá un ZIP completo.';
    } finally {
      backupBusy = false;
    }
  }
  const interval = setInterval(() => void automaticBackup(), 60000);
  interval.unref();
  const json = (response: ServerResponse, status: number, value: unknown) => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(value));
  };
  async function body(request: IncomingMessage, limit: number) {
    const declared = Number(request.headers['content-length'] ?? 0);
    if (!Number.isFinite(declared) || declared > limit)
      throw new HttpError(413, 'El archivo supera el tamaño permitido.');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, 'El archivo supera el tamaño permitido.');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'No se pudo leer la solicitud.');
    }
  }
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      const host = request.headers.host ?? '';
      const base = new URL('http://' + host);
      const allowed =
        addresses().includes(base.hostname) ||
        (!!options.publicOrigin && base.host === new URL(options.publicOrigin).host);
      if (!allowed) throw new HttpError(403, 'Dirección de acceso no autorizada.');
      if (
        !isLocal(request.socket.remoteAddress) &&
        (!privateAddress(request.socket.remoteAddress) || database.setting('lan') !== 'true')
      )
        throw new HttpError(403, 'Habilitá el acceso desde la PC del taller.');
      const path = new URL(request.url ?? '/', base).pathname;
      const method = request.method ?? 'GET';
      if (!['GET', 'HEAD'].includes(method)) {
        const expected =
          options.publicOrigin && base.host === new URL(options.publicOrigin).host
            ? options.publicOrigin
            : base.origin;
        if (
          request.headers.origin !== expected ||
          request.headers['sec-fetch-site'] === 'cross-site'
        )
          throw new HttpError(403, 'La solicitud debe iniciarse desde la aplicación del taller.');
      }
      const token =
        /(?:^|;\s*)taller_session=([A-Za-z0-9_-]+)/.exec(request.headers.cookie ?? '')?.[1] ?? '';
      if (path === '/api/config' && method === 'GET')
        return json(response, 200, {
          application: 'taller-calamante-pc',
          configured: !!database.setting('password'),
          local: isLocal(request.socket.remoteAddress),
        });
      if ((path === '/api/setup' || path === '/api/login') && method === 'POST') {
        const ip = request.socket.remoteAddress ?? '';
        const entry = attempts.get(ip);
        if (entry && entry.until > Date.now() && entry.count >= 8)
          throw new HttpError(429, 'Esperá un minuto antes de volver a intentar.');
        if (!entry || entry.until < Date.now())
          attempts.set(ip, { count: 1, until: Date.now() + 60000 });
        else entry.count++;
        const values = z
          .object({ password: z.string().min(1).max(128) })
          .parse(await body(request, 4096));
        if (path === '/api/setup') {
          if (!isLocal(ip))
            throw new HttpError(403, 'Configurá la contraseña inicial desde la PC.');
          database.setup(values.password);
        }
        const session = database.login(values.password);
        response.setHeader(
          'Set-Cookie',
          `taller_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${options.publicOrigin && base.host === new URL(options.publicOrigin).host ? '; Secure' : ''}`,
        );
        return json(response, 200, { ok: true });
      }
      if (path.startsWith('/api/')) {
        if (!database.authenticated(token))
          throw new HttpError(401, 'La sesión terminó. Volvé a ingresar para continuar.');
        if (path === '/api/logout' && method === 'POST') {
          database.logout(token);
          response.setHeader(
            'Set-Cookie',
            'taller_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
          );
          return json(response, 200, { ok: true });
        }
        if (path === '/api/state' && method === 'GET') return json(response, 200, database.state());
        if (path === '/api/state' && method === 'PUT') {
          const revision = request.headers['if-match'];
          if (typeof revision !== 'string' || !/^\d+$/.test(revision))
            throw new HttpError(428, 'Falta la revisión de los registros.');
          const result = await database.write(
            writeSchema.parse(await body(request, 145 * 1024 * 1024)),
            Number(revision),
          );
          json(response, 200, result);
          void automaticBackup();
          return;
        }
        if (path === '/api/system' && method === 'GET')
          return json(response, 200, {
            lan: database.setting('lan') === 'true',
            addresses: addresses()
              .filter((a) => a !== 'localhost')
              .map((a) => `http://${a}:${options.port}`),
            backupBusy,
            backupError,
            lastBackup,
          });
        if (path === '/api/network' && method === 'POST') {
          if (!isLocal(request.socket.remoteAddress))
            throw new HttpError(403, 'Cambiá esta opción desde la PC del taller.');
          const { enabled } = z.object({ enabled: z.boolean() }).parse(await body(request, 1024));
          database.setSetting('lan', String(enabled));
          return json(response, 200, { ok: true });
        }
        if (path === '/api/backup-now' && method === 'POST') {
          await automaticBackup(true);
          if (backupError) throw new HttpError(500, backupError);
          return json(response, 200, { lastBackup, backupBusy });
        }
        if (path === '/api/backup' && method === 'GET') {
          const { blob } = await database.backup(
            new URL(request.url ?? '/', base).searchParams.get('previous') === '1',
          );
          response.writeHead(200, {
            'Content-Type': 'application/zip',
            'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="taller-calamante-completo.zip"',
          });
          response.end(Buffer.from(await blob.arrayBuffer()));
          return;
        }
        const asset = /^\/api\/files\/(photos|documents)\/([^/]+)\/([^/]+)$/.exec(path);
        if (asset && method === 'GET') {
          const file = database.asset(
            asset[1],
            decodeURIComponent(asset[2]),
            decodeURIComponent(asset[3]),
          );
          response.writeHead(200, {
            'Content-Type': file.mime,
            'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment',
          });
          response.end(file.data);
          return;
        }
        throw new HttpError(404, 'No encontramos esa operación.');
      }
      if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Operación no admitida.');
      const relative = decodeURIComponent(path).replace(/^\//, '') || 'index.html';
      if (
        relative !== 'index.html' &&
        relative !== 'manifest.webmanifest' &&
        !/^(site-assets|icons)\/[\w.-]+$/.test(relative)
      )
        throw new HttpError(404, 'No encontramos esa página.');
      const file = resolve(webDir, relative);
      if (!file.startsWith(webDir + sep)) throw new HttpError(404, 'No encontramos ese archivo.');
      let bytes = await readFile(file);
      if (relative === 'index.html')
        bytes = Buffer.from(
          bytes
            .toString()
            .replace('<head>', '<head><script>window.__TALLER_SERVER__=true;</script>'),
        );
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json',
      };
      response.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': relative === 'index.html' ? 'no-store' : 'public, max-age=3600',
      });
      response.end(method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : (error as NodeJS.ErrnoException)?.code === 'ENOENT'
              ? 404
              : 500;
      json(response, status, {
        error:
          error instanceof HttpError
            ? error.message
            : status === 400
              ? 'Los datos no son válidos. Revisá los registros y sus relaciones.'
              : status === 404
                ? 'No encontramos ese archivo.'
                : 'No se pudo completar la operación. Los datos anteriores se conservan.',
      });
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  return {
    server,
    database,
    automaticBackup,
    async close() {
      stopping = true;
      clearInterval(interval);
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      while (backupBusy) await new Promise((resolve) => setTimeout(resolve, 20));
      database.close();
    },
  };
}
