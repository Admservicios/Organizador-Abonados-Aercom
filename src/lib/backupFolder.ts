import { z } from 'zod';
import { createPhotoBackup } from './photoBackup';
import { loadDatabase, type StoragePort } from './localDatabase';
import { photoHash } from './photos';

export const BACKUP_FOLDER_DATABASE = 'motortrack-backup-folder-v1';
export const BACKUP_FOLDER_LOCK = 'motortrack-backup-folder-v1';
export type BackupDirectory = FileSystemDirectoryHandle & {
  queryPermission: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
};
export const backupFolderSchema = z.strictObject({
  directory: z.custom<BackupDirectory>(
    (value) =>
      !!value &&
      typeof value === 'object' &&
      (value as BackupDirectory).kind === 'directory' &&
      typeof (value as BackupDirectory).getFileHandle === 'function' &&
      typeof (value as BackupDirectory).queryPermission === 'function',
  ),
  enabled: z.boolean(),
  intervalMinutes: z.union([z.literal(15), z.literal(60), z.literal(1440)]),
  lastSnapshot: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  lastSuccess: z.iso.datetime().optional(),
  lastName: z.string().min(1).max(200).optional(),
  lastSize: z.number().int().positive().optional(),
});
export type BackupFolderSettings = z.infer<typeof backupFolderSchema>;
export function folderBackupsSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker ===
      'function' &&
    !!navigator.locks?.request
  );
}
export async function pickBackupFolder() {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options: { id: string; mode: string }) => Promise<BackupDirectory>;
    }
  ).showDirectoryPicker;
  if (!picker) throw new Error('Este navegador no permite elegir una carpeta.');
  return picker.call(window, { id: 'taller-calamante-backups', mode: 'readwrite' });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BACKUP_FOLDER_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onerror = () => reject(request.error);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Cerrá las otras pestañas y reintentá.'));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('settings', mode);
    let value: T;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('No se pudo guardar la configuración de respaldos.'));
    };
    try {
      work(tx.objectStore('settings'), (result) => {
        value = result;
      });
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
    }
  });
}
export async function readBackupFolder() {
  const value = await transaction<unknown>('readonly', (store, done) => {
    const request = store.get('folder');
    request.onsuccess = () => done(request.result);
  });
  return value ? backupFolderSchema.parse(value) : null;
}
export async function saveBackupFolder(settings: BackupFolderSettings | null) {
  if (settings) backupFolderSchema.parse(settings);
  await transaction<void>('readwrite', (store) => {
    if (settings) store.put(settings, 'folder');
    else store.delete('folder');
  });
}
export function backupIsDue(settings: BackupFolderSettings, snapshot: string, now: number) {
  if (!settings.enabled || settings.lastSnapshot === snapshot) return false;
  return (
    !settings.lastSuccess ||
    now - Date.parse(settings.lastSuccess) >= settings.intervalMinutes * 60000
  );
}
export function automaticBackupName(date: Date) {
  const stamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .replace(/[^0-9-]/g, '');
  return `taller-calamante-auto-${stamp}-${crypto.randomUUID().slice(0, 8)}.zip`;
}
// Un nombre nuevo por copia. Nunca se listan, reemplazan ni eliminan copias anteriores.
export async function writeVerifiedBackup(directory: BackupDirectory, blob: Blob, name: string) {
  try {
    await directory.getFileHandle(name);
    throw new Error('Ya existe un archivo con ese nombre. No se sobrescribió.');
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
  let file: FileSystemFileHandle | undefined;
  let writer: FileSystemWritableFileStream | undefined;
  try {
    file = await directory.getFileHandle(name, { create: true });
    writer = await file.createWritable();
    await writer.write(blob);
    await writer.close();
    writer = undefined;
    const saved = await file.getFile();
    if (saved.size !== blob.size || (await photoHash(saved)) !== (await photoHash(blob)))
      throw new Error('No se pudo verificar la copia guardada.');
  } catch (error) {
    await writer?.abort().catch(() => {});
    // Solo el archivo nuevo de esta operación puede retirarse si quedó incompleto.
    if (file) await directory.removeEntry(name).catch(() => {});
    throw error;
  }
}
export type BackupAttempt =
  | { status: 'disabled' | 'permission' | 'unchanged' | 'cancelled' }
  | { status: 'saved'; settings: BackupFolderSettings };
export async function backupToFolder(
  settings: BackupFolderSettings,
  storage: StoragePort,
  options: { force?: boolean; canRun?: () => boolean; now?: Date } = {},
): Promise<BackupAttempt> {
  if (!settings.enabled) return { status: 'disabled' };
  if ((await settings.directory.queryPermission({ mode: 'readwrite' })) !== 'granted')
    return { status: 'permission' };
  const state = loadDatabase(storage);
  if (state.error) throw new Error(state.error);
  const snapshot = await photoHash(new Blob([state.raw ?? 'empty']));
  const now = options.now ?? new Date();
  if (!options.force && !backupIsDue(settings, snapshot, now.getTime()))
    return { status: 'unchanged' };
  const blob = await createPhotoBackup(state.database.data);
  if (options.canRun && !options.canRun()) return { status: 'cancelled' };
  const name = automaticBackupName(now);
  await writeVerifiedBackup(settings.directory, blob, name);
  return {
    status: 'saved',
    settings: {
      ...settings,
      lastSnapshot: snapshot,
      lastName: name,
      lastSuccess: now.toISOString(),
      lastSize: blob.size,
    },
  };
}
