import { z } from 'zod';
import { photoHash } from './photos';

export const DOCUMENT_DATABASE = 'motortrack-documents-v1';
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_VEHICLE_DOCUMENTS = 20;
export const MAX_DOCUMENTS = 200;
export const documentCategories = ['Cédula', 'Seguro', 'VTV / RTO', 'Factura', 'Otro'] as const;
export const documentReferenceSchema = z.strictObject({
  id: z.uuid(),
  vehicleId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  category: z.enum(documentCategories),
  addedAt: z.iso.datetime(),
  size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
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
  if (
    data.type !== 'application/pdf' ||
    data.size !== document.size ||
    data.size > MAX_DOCUMENT_BYTES
  )
    throw new Error('Elegí un PDF de hasta 5 MB.');
  const head = new TextDecoder().decode(await data.slice(0, 8).arrayBuffer());
  const tail = new TextDecoder().decode(await data.slice(-1024).arrayBuffer());
  if (!/^%PDF-\d\.\d/.test(head) || !tail.includes('%%EOF'))
    throw new Error('El archivo no es un PDF válido o está incompleto.');
  if ((await photoHash(data)) !== document.sha256)
    throw new Error('El documento no supera la verificación de integridad.');
}

export async function prepareDocument(
  file: File,
  vehicleId: string,
  category: DocumentReference['category'],
): Promise<PreparedDocument> {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES || !/\.pdf$/i.test(file.name))
    throw new Error('Elegí un PDF de hasta 5 MB.');
  const data = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
  const document = {
    id: crypto.randomUUID(),
    vehicleId,
    category,
    name: file.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200),
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
  for (const document of documents) await validateDocument(document);
  if (!documents.length) return;
  await transaction<void>('readwrite', (store) =>
    documents.forEach((document) => store.add(document)),
  );
}
// La copia previa puede seguir usando los archivos retirados de la vista: solo se limpian altas fallidas.
export async function discardDocuments(ids: string[]) {
  if (!ids.length) return;
  await transaction<void>('readwrite', (store) => ids.forEach((id) => store.delete(id)));
}
export async function loadReferencedDocuments(collection: {
  documentSet?: string;
  documents?: DocumentReference[];
}) {
  if (!collection.documents?.length) return [];
  if (!collection.documentSet) throw new Error('Falta la colección de documentos.');
  const rows = await transaction<unknown[]>('readonly', (store, done) => {
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
    if (!document || document.vehicleId !== ref.vehicleId)
      throw new Error('Faltan documentos. Recuperalos desde un respaldo ZIP completo.');
    const verified = { ...ref, data: document.data, setId: document.setId };
    await validateDocument(verified);
    result.push(verified);
  }
  return result;
}
