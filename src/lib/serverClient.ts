import { databaseSchema, newDatabase, type LocalDatabase, type LocalData } from './localDatabase';
export const isServerMode = () =>
  typeof window !== 'undefined' &&
  (window as Window & { __TALLER_SERVER__?: boolean }).__TALLER_SERVER__ === true;
let bootstrap: LocalDatabase | undefined;
export function setServerBootstrap(value: LocalDatabase) {
  bootstrap = databaseSchema.parse(value);
}
export function serverBootstrap() {
  if (!bootstrap) throw new Error('Falta conectar con la PC del taller.');
  return bootstrap;
}
export async function api(path: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      ...options,
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal ?? AbortSignal.timeout(30000),
    });
  } catch {
    window.dispatchEvent(
      new CustomEvent('taller-server-blocked', {
        detail:
          'Se perdió la conexión con la PC. Reconectá y revisá el historial antes de volver a guardar.',
      }),
    );
    throw new Error('No se pudo confirmar el guardado en la PC del taller.');
  }
  if (!response.ok) {
    const message = await response
      .json()
      .then((v) => v.error as string)
      .catch(() => 'No se pudo completar la operación.');
    if (response.status === 401 || response.status === 409)
      window.dispatchEvent(new CustomEvent('taller-server-blocked', { detail: message }));
    throw new Error(message);
  }
  return response;
}
export async function readServerState() {
  return databaseSchema.parse(await (await api('/state')).json());
}
type Kind = 'photos' | 'documents';
type FileRecord = { id: string; setId: string; data: Blob; [key: string]: unknown };
const pending = new Map<string, { kind: Kind; file: FileRecord }>();
export function stageServerFiles(kind: Kind, files: unknown[]) {
  for (const value of files) {
    const file = value as FileRecord;
    pending.set(file.id, { kind, file });
  }
}
export function discardServerFiles(ids: string[]) {
  ids.forEach((id) => pending.delete(id));
}
export async function loadServerFiles(kind: Kind, setId: string, refs: { id: string }[]) {
  return Promise.all(
    refs.map(async (ref) => {
      const staged = pending.get(ref.id);
      const data =
        staged?.kind === kind && staged.file.setId === setId
          ? staged.file.data
          : await (
              await api(`/files/${kind}/${encodeURIComponent(setId)}/${encodeURIComponent(ref.id)}`)
            ).blob();
      return { ...ref, setId, data };
    }),
  );
}
function base64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384)
    text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
}
export async function saveServerState(data: LocalData, revision: number, restore: boolean) {
  const uploads = [];
  for (const { kind, file } of pending.values()) {
    const refs = kind === 'photos' ? data.photos : data.documents;
    if (!refs?.some((ref) => ref.id === file.id)) continue;
    const { data: blob, ...metadata } = file;
    uploads.push({ kind, metadata, bytes: base64(new Uint8Array(await blob.arrayBuffer())) });
  }
  const response = await api('/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': String(revision) },
    body: JSON.stringify({ data: newDatabase(data).data, uploads, restore }),
  });
  let result: LocalDatabase;
  try {
    result = databaseSchema.parse(await response.json());
  } catch {
    window.dispatchEvent(
      new CustomEvent('taller-server-blocked', {
        detail:
          'No se pudo confirmar el guardado. Actualizá y revisá los registros antes de repetir la carga.',
      }),
    );
    throw new Error('No se pudo confirmar el guardado.');
  }
  for (const upload of uploads) pending.delete(upload.metadata.id as string);
  return result;
}
