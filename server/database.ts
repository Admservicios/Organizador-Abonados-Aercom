import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { databaseSchema, newDatabase, type LocalData } from '../src/lib/localDatabase';
import {
  validateDocument,
  documentMime,
  documentFileMime,
  type StoredDocument,
} from '../src/lib/documents';
import { jpegDimensions, photoHash, type StoredPhoto } from '../src/lib/photos';
import { createPhotoBackup } from '../src/lib/photoBackup';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const uploadSchema = z.strictObject({
  kind: z.enum(['photos', 'documents']),
  metadata: z.record(z.string(), z.unknown()),
  bytes: z.string().max(140 * 1024 * 1024),
});
export const writeSchema = z.strictObject({
  data: z.unknown(),
  uploads: z.array(uploadSchema).max(1200).default([]),
  restore: z.boolean().default(false),
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class WorkshopDatabase {
  readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(revision INTEGER PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets(kind TEXT NOT NULL,set_id TEXT NOT NULL,id TEXT NOT NULL,mime TEXT NOT NULL,sha256 TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(kind,set_id,id));
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);`);
    if (!this.db.prepare('SELECT id FROM state').get())
      this.db
        .prepare('INSERT INTO state(id,payload) VALUES(1,?)')
        .run(JSON.stringify(newDatabase()));
    // Una base inválida nunca se sustituye silenciosamente por otra vacía.
    this.state();
  }
  state() {
    const row = this.db.prepare('SELECT payload FROM state WHERE id=1').get()!;
    return databaseSchema.parse(JSON.parse(String(row.payload)));
  }
  setting(key: string) {
    return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value as
      string | undefined;
  }
  setSetting(key: string, value: string) {
    this.db
      .prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, value);
  }
  setup(password: string) {
    if (this.setting('password'))
      throw new HttpError(409, 'La contraseña inicial ya fue configurada.');
    if (password.length < 12 || password.length > 128)
      throw new HttpError(400, 'Usá una contraseña de entre 12 y 128 caracteres.');
    const salt = randomBytes(16).toString('hex');
    this.setSetting('password', `${salt}:${scryptSync(password, salt, 32).toString('hex')}`);
  }
  login(password: string) {
    const stored = this.setting('password');
    if (!stored) throw new HttpError(401, 'Primero configurá el acceso desde la PC del taller.');
    const [salt, key] = stored.split(':');
    const actual = scryptSync(password.slice(0, 128), salt, 32);
    if (password.length > 128 || !timingSafeEqual(actual, Buffer.from(key, 'hex')))
      throw new HttpError(401, 'La contraseña no es correcta.');
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    this.db
      .prepare('INSERT INTO sessions VALUES(?,?)')
      .run(hash(token), Date.now() + 8 * 60 * 60 * 1000);
    return token;
  }
  authenticated(token: string) {
    const row = this.db.prepare('SELECT expires FROM sessions WHERE token_hash=?').get(hash(token));
    return !!row && Number(row.expires) > Date.now();
  }
  logout(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
  }
  asset(kind: string, setId: string, id: string) {
    const state = this.state().data;
    const refs =
      kind === 'photos' ? state.photos : kind === 'documents' ? state.documents : undefined;
    if (
      !refs?.some((ref) => ref.id === id) ||
      (kind === 'photos' ? state.photoSet : state.documentSet) !== setId
    )
      throw new HttpError(404, 'No encontramos el archivo.');
    const row = this.db
      .prepare('SELECT data,mime FROM assets WHERE kind=? AND set_id=? AND id=?')
      .get(kind, setId, id);
    if (!row) throw new HttpError(404, 'El archivo no está disponible. Restaurá un ZIP completo.');
    return { data: Buffer.from(row.data as Uint8Array), mime: String(row.mime) };
  }
  async write(input: z.infer<typeof writeSchema>, expected: number) {
    const next = newDatabase(input.data as LocalData, expected + 1);
    const files: {
      kind: string;
      setId: string;
      id: string;
      mime: string;
      sha: string;
      data: Buffer;
    }[] = [];
    const unique = new Set<string>();
    for (const upload of input.uploads) {
      const { kind, metadata } = upload;
      const setId = String(metadata.setId);
      const id = String(metadata.id);
      const refs = kind === 'photos' ? next.data.photos : next.data.documents;
      const ref = refs?.find((r) => r.id === id);
      if (!ref || setId !== (kind === 'photos' ? next.data.photoSet : next.data.documentSet))
        throw new HttpError(400, 'Hay archivos sin un registro asociado.');
      const key = `${kind}/${setId}/${id}`;
      if (unique.has(key)) throw new HttpError(400, 'Hay archivos duplicados.');
      unique.add(key);
      if (upload.bytes.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.bytes))
        throw new HttpError(400, 'El archivo no es válido.');
      const bytes = Buffer.from(upload.bytes, 'base64');
      if (bytes.length !== ref.size) throw new HttpError(400, 'El tamaño del archivo no coincide.');
      const mime = kind === 'photos' ? 'image/jpeg' : documentMime(ref as StoredDocument);
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      if ((await photoHash(blob)) !== ref.sha256)
        throw new HttpError(400, 'No se pudo verificar la integridad del archivo.');
      if (kind === 'documents') await validateDocument({ ...ref, data: blob } as StoredDocument);
      else {
        const dimensions = jpegDimensions(new Uint8Array(bytes));
        const photo = ref as StoredPhoto;
        if (dimensions.width !== photo.width || dimensions.height !== photo.height)
          throw new HttpError(400, 'Las dimensiones de la foto no coinciden.');
      }
      files.push({ kind, setId, id, mime, sha: ref.sha256, data: bytes });
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.state();
      if (previous.revision !== expected)
        throw new HttpError(
          409,
          'Los datos cambiaron desde otra pantalla. Actualizá y revisá los registros antes de guardar.',
        );
      for (const file of files) {
        const previousFile = this.db
          .prepare('SELECT sha256 FROM assets WHERE kind=? AND set_id=? AND id=?')
          .get(file.kind, file.setId, file.id);
        if (previousFile && previousFile.sha256 !== file.sha)
          throw new HttpError(409, 'No se puede reemplazar un archivo existente.');
        this.db
          .prepare('INSERT OR IGNORE INTO assets VALUES(?,?,?,?,?,?)')
          .run(file.kind, file.setId, file.id, file.mime, file.sha, file.data);
      }
      for (const kind of ['photos', 'documents'] as const) {
        const setId = kind === 'photos' ? next.data.photoSet : next.data.documentSet;
        for (const ref of next.data[kind] ?? []) {
          const asset = this.db
            .prepare(
              'SELECT sha256,mime,length(data) AS size FROM assets WHERE kind=? AND set_id=? AND id=?',
            )
            .get(kind, setId!, ref.id);
          if (
            !asset ||
            asset.sha256 !== ref.sha256 ||
            Number(asset.size) !== ref.size ||
            asset.mime !==
              (kind === 'photos' ? 'image/jpeg' : documentMime(ref as StoredDocument)) ||
            (kind === 'documents' &&
              (ref as StoredDocument).mime !== undefined &&
              documentFileMime(ref.name) !== documentMime(ref as StoredDocument))
          )
            throw new HttpError(
              400,
              'Faltan archivos. Para trasladar fotos y documentos usá el respaldo ZIP completo.',
            );
        }
      }
      this.db
        .prepare('INSERT INTO history VALUES(?,?)')
        .run(previous.revision, JSON.stringify(previous));
      this.db.prepare('DELETE FROM history WHERE revision<?').run(expected - 30);
      this.db.prepare('UPDATE state SET payload=? WHERE id=1').run(JSON.stringify(next));
      this.db.exec('COMMIT');
      return next;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  async backup(previous = false) {
    const previousRow = previous
      ? this.db.prepare('SELECT payload FROM history ORDER BY revision DESC LIMIT 1').get()
      : undefined;
    if (previous && !previousRow) throw new HttpError(404, 'Todavía no hay una copia previa.');
    const state = previousRow
      ? databaseSchema.parse(JSON.parse(String(previousRow.payload)))
      : this.state();
    const photos: StoredPhoto[] = [];
    const documents: StoredDocument[] = [];
    for (const kind of ['photos', 'documents'] as const) {
      const setId = (kind === 'photos' ? state.data.photoSet : state.data.documentSet)!;
      for (const ref of state.data[kind] ?? []) {
        const row = this.db
          .prepare('SELECT data,mime FROM assets WHERE kind=? AND set_id=? AND id=?')
          .get(kind, setId, ref.id);
        if (!row) throw new HttpError(404, 'Faltan archivos en la copia previa.');
        const file = { data: Buffer.from(row.data as Uint8Array), mime: String(row.mime) };
        const value = {
          ...ref,
          setId,
          data: new Blob([new Uint8Array(file.data)], { type: file.mime }),
        };
        if (kind === 'photos') photos.push(value as StoredPhoto);
        else documents.push(value as StoredDocument);
      }
    }
    return {
      revision: state.revision,
      blob: await createPhotoBackup(state.data, photos, documents),
    };
  }
  close() {
    this.db.close();
  }
}
