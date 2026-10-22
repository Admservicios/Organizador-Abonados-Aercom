import { z } from 'zod';

export const PHOTO_DATABASE = 'motortrack-photos-v1';
export const MAX_SERVICE_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 350 * 1024;
export const MAX_PHOTO_EDGE = 1600;
export const photoInfoSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  width: z.number().int().min(1).max(MAX_PHOTO_EDGE),
  height: z.number().int().min(1).max(MAX_PHOTO_EDGE),
  size: z.number().int().min(1).max(MAX_PHOTO_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const photoReferenceSchema = photoInfoSchema.extend({
  serviceId: z.string().min(1).max(100),
});
export type PhotoReference = z.infer<typeof photoReferenceSchema>;
export type PreparedPhoto = z.infer<typeof photoInfoSchema> & { data: Blob };
export type StoredPhoto = PreparedPhoto & { setId: string; serviceId: string };
const storedPhotoSchema = photoReferenceSchema.extend({
  setId: z.uuid(),
  data: z.instanceof(Blob),
});

export async function photoHash(data: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await data.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Se revisa el encabezado antes de decodificar para limitar las dimensiones en memoria.
export function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error('La foto JPEG no es válida.');
  let dimensions: { width: number; height: number } | undefined;
  let offset = 2;
  const frames = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 255) throw new Error('El encabezado JPEG está dañado.');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length)
      throw new Error('El encabezado JPEG está incompleto.');
    if (frames.has(marker)) {
      if (length < 8) throw new Error('Las dimensiones JPEG no son válidas.');
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      if (
        !width ||
        !height ||
        width > MAX_PHOTO_EDGE ||
        height > MAX_PHOTO_EDGE ||
        (dimensions && (width !== dimensions.width || height !== dimensions.height))
      )
        throw new Error('Las dimensiones de la foto no son válidas.');
      dimensions = { width, height };
    }
    offset += length;
  }
  if (!dimensions) throw new Error('La foto no tiene dimensiones JPEG válidas.');
  return dimensions;
}

function openPhotos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(PHOTO_DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('photos', { keyPath: 'id' });
      store.createIndex('setId', 'setId');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Cerrá las otras pestañas del taller y volvé a intentar.'));
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
  work: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openPhotos();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction('photos', mode);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let value: T;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('No se pudieron guardar las fotos.'));
    };
    try {
      work(tx.objectStore('photos'), (result) => {
        value = result;
      });
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
    }
  });
}

export async function readPhotos(setId?: string): Promise<StoredPhoto[]> {
  if (!setId) return [];
  const rows = await transaction<unknown[]>('readonly', (store, done) => {
    const request = store.index('setId').getAll(setId);
    request.onsuccess = () => done(request.result);
  });
  return rows.map((row) => storedPhotoSchema.parse(row));
}

export async function loadReferencedPhotos(collection: {
  photoSet?: string;
  photos?: PhotoReference[];
}) {
  const refs = collection.photos ?? [];
  if (!refs.length) return [];
  const stored = new Map((await readPhotos(collection.photoSet)).map((photo) => [photo.id, photo]));
  const result: StoredPhoto[] = [];
  for (const ref of refs) {
    const photo = stored.get(ref.id);
    if (
      !photo ||
      photo.serviceId !== ref.serviceId ||
      photo.data.size !== ref.size ||
      (await photoHash(photo.data)) !== ref.sha256
    )
      throw new Error(
        'Faltan fotos o no se pueden leer completas. Recuperalas desde un respaldo ZIP.',
      );
    result.push({ ...ref, data: photo.data, setId: photo.setId });
  }
  return result;
}

export async function validatePhoto(photo: PreparedPhoto) {
  photoInfoSchema.parse({
    id: photo.id,
    name: photo.name,
    width: photo.width,
    height: photo.height,
    size: photo.size,
    sha256: photo.sha256,
  });
  if (
    photo.data.type !== 'image/jpeg' ||
    photo.data.size !== photo.size ||
    (await photoHash(photo.data)) !== photo.sha256
  )
    throw new Error('La foto no tiene un formato o tamaño válido.');
  const dimensions = jpegDimensions(new Uint8Array(await photo.data.arrayBuffer()));
  if (dimensions.width !== photo.width || dimensions.height !== photo.height)
    throw new Error('Las dimensiones de la foto no coinciden con sus datos.');
  const image = await createImageBitmap(photo.data);
  try {
    if (
      image.width !== photo.width ||
      image.height !== photo.height ||
      image.width > MAX_PHOTO_EDGE ||
      image.height > MAX_PHOTO_EDGE
    )
      throw new Error('Las dimensiones de la foto no son válidas.');
  } finally {
    image.close();
  }
}

export async function storePhotos(photos: StoredPhoto[]) {
  for (const photo of photos) await validatePhoto(photo);
  if (!photos.length) return;
  await transaction<void>('readwrite', (store) => {
    for (const photo of photos) store.add(photo);
  });
}

// Solo se retiran los archivos nuevos de una operación fallida. Nunca los de la copia previa.
export async function discardPhotos(ids: string[]) {
  if (!ids.length) return;
  await transaction<void>('readwrite', (store) => {
    ids.forEach((id) => store.delete(id));
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > 10 * 1024 * 1024 || !file.size)
    throw new Error('Cada imagen debe pesar entre 1 byte y 10 MB.');
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = file.type === 'image/jpeg' && head[0] === 255 && head[1] === 216 && head[2] === 255;
  const png =
    file.type === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => head[i] === b);
  const webp =
    file.type === 'image/webp' &&
    String.fromCharCode(...head.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('Elegí imágenes JPG, PNG o WebP válidas.');
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No se pudo abrir la imagen. Elegí otra foto.');
  }
  try {
    let scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(image.width, image.height));
    for (let attempt = 0; attempt < 4; attempt++) {
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('El navegador no permite preparar la imagen.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const data = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.'))),
          'image/jpeg',
          0.82 - attempt * 0.12,
        ),
      );
      canvas.width = canvas.height = 0;
      if (data.size <= MAX_PHOTO_BYTES)
        return {
          id: crypto.randomUUID(),
          name: `${file.name.replace(/\.[^.]*$/, '').slice(0, 180) || 'foto'}.jpg`,
          data,
          width,
          height,
          size: data.size,
          sha256: await photoHash(data),
        };
      scale *= 0.75;
    }
    throw new Error('La imagen sigue siendo demasiado grande. Elegí una foto de menor tamaño.');
  } finally {
    image.close();
  }
}
