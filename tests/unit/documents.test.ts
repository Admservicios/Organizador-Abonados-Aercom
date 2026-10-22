import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { zipSync, unzipSync } from 'fflate';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { emptyData, makeBackup } from '../../src/lib/localDatabase';
import { prepareDocument, validateDocument } from '../../src/lib/documents';
import { createPhotoBackup, parsePhotoBackup } from '../../src/lib/photoBackup';

async function sample() {
  const bytes = await readFile(new URL('../fixtures/documento-prueba.pdf', import.meta.url));
  const document = await prepareDocument(
    new File([bytes], 'seguro.pdf', { type: 'application/pdf' }),
    'v2',
    'Seguro',
  );
  const { data: _blob, ...ref } = document;
  const setId = crypto.randomUUID();
  const data = {
    ...emptyData(),
    customers: initialCustomers,
    vehicles: initialVehicles,
    documentSet: setId,
    documents: [ref],
  };
  return { document: { ...document, setId }, data };
}
describe('documentos PDF locales', () => {
  it('conserva el original, rechaza falsos PDF, archivos incompletos y tamaños excesivos', async () => {
    const { document } = await sample();
    await expect(validateDocument(document)).resolves.toBeUndefined();
    await expect(
      prepareDocument(new File(['No es PDF'], 'falso.pdf'), 'v2', 'Otro'),
    ).rejects.toThrow('PDF válido');
    await expect(
      prepareDocument(new File(['%PDF-1.3\nincompleto'], 'roto.pdf'), 'v2', 'Otro'),
    ).rejects.toThrow('incompleto');
    await expect(
      prepareDocument(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.pdf'), 'v2', 'Otro'),
    ).rejects.toThrow('5 MB');
    await expect(validateDocument({ ...document, sha256: '0'.repeat(64) })).rejects.toThrow(
      'integridad',
    );
  });
  it('valida relaciones, categorías, duplicados, colección y cantidad por vehículo sin cambiar bases anteriores', async () => {
    const { data } = await sample();
    expect(makeBackup(data).data).toEqual(data);
    expect(makeBackup(emptyData()).data).toEqual(emptyData());
    expect(() => makeBackup({ ...data, documentSet: undefined })).toThrow();
    expect(() =>
      makeBackup({ ...data, documents: [{ ...data.documents[0], vehicleId: 'no-existe' }] }),
    ).toThrow();
    expect(() =>
      makeBackup({ ...data, documents: [...data.documents, ...data.documents] }),
    ).toThrow();
    expect(() =>
      makeBackup({
        ...data,
        documents: Array.from({ length: 21 }, () => ({
          ...data.documents[0],
          id: crypto.randomUUID(),
        })),
      }),
    ).toThrow();
  });
  it('incluye bytes y referencias en el ZIP y recupera el PDF original', async () => {
    const { document, data } = await sample();
    const bytes = new Uint8Array(
      await (await createPhotoBackup(data, [], [document])).arrayBuffer(),
    );
    const parsed = await parsePhotoBackup(bytes);
    expect(parsed.backup.data).toEqual(data);
    expect(parsed.documents).toHaveLength(1);
    expect(await parsed.documents[0].data.arrayBuffer()).toEqual(await document.data.arrayBuffer());
    const entries = unzipSync(bytes);
    delete entries[`documents/${document.id}.pdf`];
    await expect(parsePhotoBackup(zipSync(entries))).rejects.toThrow('adjuntos');
    await expect(createPhotoBackup(data, [], [])).rejects.toThrow('Faltan documentos');
  });
  it('rechaza documentos adulterados y expansión excesiva antes de restaurar', async () => {
    const { document, data } = await sample();
    const entries = unzipSync(
      new Uint8Array(await (await createPhotoBackup(data, [], [document])).arrayBuffer()),
    );
    entries[`documents/${document.id}.pdf`][100] ^= 1;
    await expect(parsePhotoBackup(zipSync(entries))).rejects.toThrow('integridad');
    await expect(
      parsePhotoBackup(
        zipSync({
          'documents/11111111-1111-4111-8111-111111111111.pdf': new Uint8Array(5 * 1024 * 1024 + 1),
        }),
      ),
    ).rejects.toThrow('tamaño permitido');
  });
});
