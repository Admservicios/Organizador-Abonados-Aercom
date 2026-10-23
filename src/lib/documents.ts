import {
  isServerMode,
  stageServerFiles,
  discardServerFiles,
  loadServerFiles,
} from './serverClient';
import { randomId } from './ids';
import { z } from 'zod';
import { photoHash } from './photos';

export const DOCUMENT_DATABASE = 'motortrack-documents-v1';
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_VEHICLE_DOCUMENTS = 20;
export const MAX_DOCUMENTS = 200;
export const documentCategories = ['Cédula', 'Seguro', 'VTV / RTO', 'Factura', 'Otro'] as const;
export const documentMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type DocumentMime = (typeof documentMimes)[number];
const formats = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;
export const DOCUMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
export function documentFileMime(name: string): DocumentMime | undefined {
  const extension = /\.([^.]+)$/.exec(name)?.[1].toLowerCase();
  return extension && Object.hasOwn(formats, extension)
    ? formats[extension as keyof typeof formats]
    : undefined;
}
export const documentMime = (ref: { mime?: DocumentMime }) => ref.mime ?? 'application/pdf';
export const documentExtension = (ref: { mime?: DocumentMime }) =>
  (
    ({
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }) as const
  )[documentMime(ref)];
export const documentArchivePath = (ref: { id: string; mime?: DocumentMime }) =>
  `documents/${ref.id}.${documentExtension(ref)}`;
export const MAX_DOCUMENT_IMAGE_PIXELS = 20_000_000;

// Dimensiones comprobadas antes de decodificar imágenes para acotar el uso de memoria.
export function documentImageDimensions(
  bytes: Uint8Array,
  mime: Exclude<DocumentMime, 'application/pdf'>,
) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    new TextDecoder().decode(bytes.slice(start, start + length));
  let width = 0,
    height = 0;
  if (mime === 'image/png') {
    if (
      bytes.length < 45 ||
      bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10' ||
      view.getUint32(8) !== 13 ||
      ascii(12, 4) !== 'IHDR' ||
      ascii(bytes.length - 8, 4) !== 'IEND' ||
      view.getUint32(bytes.length - 12) !== 0
    )
      throw new Error('La imagen PNG está dañada o incompleta.');
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (mime === 'image/jpeg') {
    if (
      bytes.length < 12 ||
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes.at(-2) !== 255 ||
      bytes.at(-1) !== 217
    )
      throw new Error('La imagen JPEG está dañada o incompleta.');
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) throw new Error('El encabezado JPEG está dañado.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length)
        throw new Error('La imagen JPEG está incompleta.');
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        if (length < 8) throw new Error('Las dimensiones JPEG no son válidas.');
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else {
    if (
      bytes.length < 25 ||
      ascii(0, 4) !== 'RIFF' ||
      ascii(8, 4) !== 'WEBP' ||
      view.getUint32(4, true) + 8 !== bytes.length
    )
      throw new Error('La imagen WebP está dañada o incompleta.');
    const chunk = ascii(12, 4);
    const length = view.getUint32(16, true);
    if (20 + length > bytes.length) throw new Error('La imagen WebP está incompleta.');
    if (chunk === 'VP8X' && length >= 10) {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === 'VP8L' && length >= 5 && bytes[20] === 0x2f) {
      width = 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff);
      height = 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff);
    } else if (
      chunk === 'VP8 ' &&
      length >= 10 &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    ) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    }
  }
  if (
    !width ||
    !height ||
    width > 12000 ||
    height > 12000 ||
    width * height > MAX_DOCUMENT_IMAGE_PIXELS
  )
    throw new Error(
      'La imagen debe tener dimensiones válidas de hasta 20 megapíxeles y 12.000 píxeles por lado.',
    );
  return { width, height };
}

export const documentReferenceSchema = z.strictObject({
  id: z.uuid(),
  vehicleId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  category: z.enum(documentCategories),
  addedAt: z.iso.datetime(),
  size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  mime: z.enum(documentMimes).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DocumentReference = z.infer<typeof documentReferenceSchema>;
export type PreparedDocument = DocumentReference & { data: Blob };
export type StoredDocument = PreparedDocument & { setId: string };
const storedSchema = documentReferenceSchema.extend({ setId: z.uuid(), data: z.instanceof(Blob) });

export async function validateDocument(document: PreparedDocument) {
  const { data, ...ref } = document;
  // Los registros almacenados pueden incluir setId; la referencia se valida aparte.
  documentReferenceSchema.parse(
    Object.fromEntries(
      Object.keys(documentReferenceSchema.shape).map((key) => [key, ref[key as keyof typeof ref]]),
    ),
  );
  const mime = documentMime(document);
  if (data.type !== mime || data.size !== document.size || data.size > MAX_DOCUMENT_BYTES)
    throw new Error('Elegí un PDF, JPG, PNG o WebP de hasta 5 MB.');
  if (document.mime && documentFileMime(document.name) !== mime)
    throw new Error('La extensión del archivo no coincide con su formato original.');
  if ((await photoHash(data)) !== document.sha256)
    throw new Error('El documento no supera la verificación de integridad.');
  if (mime === 'application/pdf') {
    const head = new TextDecoder().decode(await data.slice(0, 8).arrayBuffer());
    const tail = new TextDecoder().decode(await data.slice(-1024).arrayBuffer());
    if (!/^%PDF-\d\.\d/.test(head) || !tail.includes('%%EOF'))
      throw new Error('El archivo no es un PDF válido o está incompleto.');
  } else {
    const dimensions = documentImageDimensions(new Uint8Array(await data.arrayBuffer()), mime);
    if (typeof createImageBitmap === 'function') {
      let image: ImageBitmap;
      try {
        image = await createImageBitmap(data);
      } catch {
        throw new Error('La imagen está dañada o no se puede leer.');
      }
      try {
        if (!(
          (image.width === dimensions.width && image.height === dimensions.height) ||
          (image.width === dimensions.height && image.height === dimensions.width)
        ))
          throw new Error('Las dimensiones de la imagen no coinciden.');
      } finally {
        image.close();
      }
    }
  }
}

export async function prepareDocument(
  file: File,
  vehicleId: string,
  category: DocumentReference['category'],
): Promise<PreparedDocument> {
  const mime = documentFileMime(file.name);
  if (!file.size || file.size > MAX_DOCUMENT_BYTES || !mime)
    throw new Error('Elegí un PDF, JPG, PNG o WebP de hasta 5 MB.');
  const data = new Blob([await file.arrayBuffer()], { type: mime });
  const document = {
    ...(mime !== 'application/pdf' ? { mime } : {}),
    id: randomId(),
    vehicleId,
    category,
    name: file.name
      .replace(/[\\/\u0000-\u001f]/g, '_')
      .replace(/^(.+)\.([^.]+)$/, (_, stem, ext) => `${stem.slice(0, 199 - ext.length)}.${ext}`),
    addedAt: new Date().toISOString(),
    size: data.size,
    sha256: await photoHash(data),
    data,
  };
  await validateDocument(document);
  return document;
}

function openDocuments(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DOCUMENT_DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('documents', { keyPath: 'id' });
      store.createIndex('setId', 'setId');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Cerrá las otras pestañas del taller y reintentá.'));
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
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (result: T) => void) => void,
): Promise<T> {
  const db = await openDocuments();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction('documents', mode);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let result: T;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('No se pudieron guardar los documentos.'));
    };
    try {
      work(tx.objectStore('documents'), (value) => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
    }
  });
}
export async function storeDocuments(documents: StoredDocument[]) {
  if (isServerMode()) {
    stageServerFiles('documents', documents);
    return;
  }
  for (const document of documents) await validateDocument(document);
  if (!documents.length) return;
  await transaction<void>('readwrite', (store) =>
    documents.forEach((document) => store.add(document)),
  );
}
// La copia previa puede seguir usando los archivos retirados de la vista: solo se limpian altas fallidas.
export async function discardDocuments(ids: string[]) {
  if (isServerMode()) {
    discardServerFiles(ids);
    return;
  }
  if (!ids.length) return;
  await transaction<void>('readwrite', (store) => ids.forEach((id) => store.delete(id)));
}
export async function loadReferencedDocuments(collection: {
  documentSet?: string;
  documents?: DocumentReference[];
}) {
  if (!collection.documents?.length) return [];
  if (!collection.documentSet) throw new Error('Falta la colección de documentos.');
  const rows = isServerMode()
    ? await loadServerFiles('documents', collection.documentSet, collection.documents)
    : await transaction<unknown[]>('readonly', (store, done) => {
        const request = store.index('setId').getAll(collection.documentSet!);
        request.onsuccess = () => done(request.result);
      });
  const stored = new Map(
    rows.map((row) => {
      const document = storedSchema.parse(row);
      return [document.id, document];
    }),
  );
  const result: StoredDocument[] = [];
  for (const ref of collection.documents) {
    const document = stored.get(ref.id);
    if (!document || document.sha256 !== ref.sha256)
      throw new Error('Faltan documentos. Recuperalos desde un respaldo ZIP completo.');
    const verified = { ...ref, data: document.data, setId: document.setId };
    await validateDocument(verified);
    result.push(verified);
  }
  return result;
}
