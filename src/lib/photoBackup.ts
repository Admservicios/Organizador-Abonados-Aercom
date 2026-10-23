import type { Zippable } from 'fflate';
import {
  makeBackup,
  parseBackup,
  MAX_BACKUP_BYTES,
  type LocalBackup,
  type LocalData,
} from './localDatabase';
import {
  MAX_PHOTO_BYTES,
  jpegDimensions,
  loadReferencedPhotos,
  photoHash,
  type PreparedPhoto,
  type StoredPhoto,
} from './photos';
import {
  loadReferencedDocuments,
  documentArchivePath,
  documentMime,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  validateDocument,
  type PreparedDocument,
  type StoredDocument,
} from './documents';

export const MAX_PHOTO_ARCHIVE_BYTES = 100 * 1024 * 1024;
export type ArchivePhoto = PreparedPhoto & { serviceId: string };
export type PhotoBackupCandidate = {
  backup: LocalBackup;
  photos: ArchivePhoto[];
  documents: PreparedDocument[];
};

export async function createPhotoBackup(
  data: LocalData,
  files?: StoredPhoto[],
  documentFiles?: StoredDocument[],
) {
  const backup = makeBackup(data);
  const photos = files ?? (await loadReferencedPhotos(data));
  const refs = backup.data.photos ?? [];
  if (photos.length !== refs.length) throw new Error('Faltan fotos para completar el respaldo.');
  const documents = documentFiles ?? (await loadReferencedDocuments(data));
  const documentRefs = backup.data.documents ?? [];
  if (documents.length !== documentRefs.length)
    throw new Error('Faltan documentos para completar el respaldo.');
  const { zipSync, strToU8 } = await import('fflate');
  const json = strToU8(JSON.stringify(backup, null, 2));
  if (json.length > MAX_BACKUP_BYTES) throw new Error('Los registros superan el límite de 5 MB.');
  const entries: Zippable = { 'backup.json': [json, { level: 6 }] };
  let size = json.length;
  for (const ref of refs) {
    const photo = photos.find((p) => p.id === ref.id);
    if (
      !photo ||
      photo.serviceId !== ref.serviceId ||
      photo.data.size !== ref.size ||
      (await photoHash(photo.data)) !== ref.sha256
    )
      throw new Error('No se pudo verificar la integridad de las fotos.');
    size += photo.data.size;
    if (size > MAX_PHOTO_ARCHIVE_BYTES) throw new Error('El respaldo con fotos supera los 100 MB.');
    entries[`photos/${photo.id}.jpg`] = [
      new Uint8Array(await photo.data.arrayBuffer()),
      { level: 0 },
    ];
  }
  for (const ref of documentRefs) {
    const document = documents.find((d) => d.id === ref.id);
    if (!document || document.vehicleId !== ref.vehicleId)
      throw new Error('Faltan documentos para completar el respaldo.');
    const verified = { ...ref, data: document.data };
    await validateDocument(verified);
    size += verified.data.size;
    if (size > MAX_PHOTO_ARCHIVE_BYTES) throw new Error('El respaldo completo supera los 100 MB.');
    entries[documentArchivePath(ref)] = [
      new Uint8Array(await verified.data.arrayBuffer()),
      { level: 0 },
    ];
  }
  const bytes = zipSync(entries);
  if (bytes.length > MAX_PHOTO_ARCHIVE_BYTES)
    throw new Error('El respaldo con fotos supera los 100 MB.');
  return new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
}

export async function parsePhotoBackup(bytes: Uint8Array): Promise<PhotoBackupCandidate> {
  if (bytes.length > MAX_PHOTO_ARCHIVE_BYTES) throw new Error('El respaldo ZIP supera los 100 MB.');
  const { unzipSync, strFromU8 } = await import('fflate');
  let size = 0;
  const names = new Set<string>();
  const entries = unzipSync(bytes, {
    filter: (entry) => {
      if (names.has(entry.name) || names.size >= 1001 + MAX_DOCUMENTS)
        throw new Error('El ZIP contiene archivos duplicados o demasiados archivos.');
      names.add(entry.name);
      const json = /^[\w.-]+\.json$/.test(entry.name);
      const photo = /^photos\/[a-fA-F0-9-]{36}\.jpg$/.test(entry.name);
      const document = /^documents\/[a-fA-F0-9-]{36}\.(?:pdf|jpg|png|webp)$/.test(entry.name);
      if (!json && !photo && !document) throw new Error('El ZIP contiene archivos no admitidos.');
      if (
        entry.originalSize >
        (json ? MAX_BACKUP_BYTES : document ? MAX_DOCUMENT_BYTES : MAX_PHOTO_BYTES)
      )
        throw new Error('Un archivo del ZIP supera el tamaño permitido.');
      size += entry.originalSize;
      if (size > MAX_PHOTO_ARCHIVE_BYTES)
        throw new Error('El contenido del ZIP supera los 100 MB.');
      return true;
    },
  });
  const jsonFiles = Object.keys(entries).filter((name) => name.endsWith('.json'));
  if (jsonFiles.length !== 1) throw new Error('El ZIP debe contener un único respaldo JSON.');
  const backup = parseBackup(strFromU8(entries[jsonFiles[0]]));
  const refs = backup.data.photos ?? [];
  const documentRefs = backup.data.documents ?? [];
  if (Object.keys(entries).length !== refs.length + documentRefs.length + 1)
    throw new Error('Los archivos del ZIP no coinciden con los adjuntos registrados.');
  const photos: ArchivePhoto[] = [];
  for (const ref of refs) {
    const raw = entries[`photos/${ref.id}.jpg`];
    if (!raw || raw.length !== ref.size || raw[0] !== 255 || raw[1] !== 216 || raw[2] !== 255)
      throw new Error('Una foto falta o está dañada.');
    const data = new Blob([new Uint8Array(raw)], { type: 'image/jpeg' });
    if ((await photoHash(data)) !== ref.sha256)
      throw new Error('Una foto no supera la verificación de integridad.');
    const dimensions = jpegDimensions(raw);
    if (dimensions.width !== ref.width || dimensions.height !== ref.height)
      throw new Error('Las dimensiones de una foto no coinciden con el respaldo.');
    photos.push({ ...ref, data });
  }
  const documents: PreparedDocument[] = [];
  for (const ref of documentRefs) {
    const raw = entries[documentArchivePath(ref)];
    if (!raw) throw new Error('Falta un documento en el ZIP.');
    const document = { ...ref, data: new Blob([new Uint8Array(raw)], { type: documentMime(ref) }) };
    await validateDocument(document);
    documents.push(document);
  }
  return { backup, photos, documents };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
