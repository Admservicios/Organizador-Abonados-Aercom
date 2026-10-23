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

describe('imágenes como documentos, sin modificar los originales', () => {
  const examples = [
    ['foto-prueba.jpg', 'image/jpeg'],
    ['documento-rotado.jpg', 'image/jpeg'],
    ['documento-imagen.png', 'image/png'],
    ['documento-imagen.webp', 'image/webp'],
    ['documento-lossless.webp', 'image/webp'],
    ['documento-alpha.webp', 'image/webp'],
  ] as const;
  for (const [name, mime] of examples)
    it(`conserva ${name} y recupera exactamente sus bytes desde el ZIP`, async () => {
      const bytes = await readFile(new URL(`../fixtures/${name}`, import.meta.url));
      const image = await prepareDocument(new File([bytes], name, { type: mime }), 'v2', 'Cédula');
      expect(image.mime).toBe(mime);
      expect(await image.data.arrayBuffer()).toEqual(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      const { document: pdf, data } = await sample();
      const { data: _blob, ...ref } = image;
      const mixed = { ...data, documents: [...data.documents, ref] };
      const zip = new Uint8Array(
        await (
          await createPhotoBackup(mixed, [], [pdf, { ...image, setId: data.documentSet }])
        ).arrayBuffer(),
      );
      const parsed = await parsePhotoBackup(zip);
      expect(parsed.backup.data).toEqual(mixed);
      expect(parsed.documents[1].mime).toBe(mime);
      expect(await parsed.documents[1].data.arrayBuffer()).toEqual(await image.data.arrayBuffer());
      const entries = unzipSync(zip);
      const path = Object.keys(entries).find((p) => p.startsWith(`documents/${image.id}.`))!;
      entries[path][entries[path].length - 1] ^= 1;
      await expect(parsePhotoBackup(zipSync(entries))).rejects.toThrow('integridad');
    });
  it('rechaza imágenes falsas, truncadas y formatos no admitidos sin confiar en nombre o MIME del navegador', async () => {
    const bytes = await readFile(new URL('../fixtures/documento-imagen.png', import.meta.url));
    for (const name of ['falso.jpg', 'falso.webp', 'archivo.svg', 'archivo.html', 'png']) {
      await expect(
        prepareDocument(new File([bytes], name, { type: 'image/png' }), 'v2', 'Otro'),
      ).rejects.toThrow();
    }
    await expect(
      prepareDocument(new File([bytes.subarray(0, -4)], 'roto.png'), 'v2', 'Otro'),
    ).rejects.toThrow('incompleta');
    const valid = await prepareDocument(
      new File([bytes], 'imagen.png', { type: '' }),
      'v2',
      'Otro',
    );
    await expect(validateDocument({ ...valid, name: 'imagen.pdf' })).rejects.toThrow('extensión');
    await expect(
      validateDocument({ ...valid, data: new Blob([bytes], { type: 'image/jpeg' }) }),
    ).rejects.toThrow('5 MB');
    expect(valid.mime).toBe('image/png');
  });
  it('limita las dimensiones antes de decodificar y preserva la extensión al acortar nombres', async () => {
    const bytes = new Uint8Array(
      await readFile(new URL('../fixtures/documento-imagen.png', import.meta.url)),
    );
    const big = new Uint8Array(bytes);
    new DataView(big.buffer).setUint32(16, 12000);
    new DataView(big.buffer).setUint32(20, 12000);
    await expect(prepareDocument(new File([big], 'grande.png'), 'v2', 'Otro')).rejects.toThrow(
      '20 megapíxeles',
    );
    const file = await prepareDocument(new File([bytes], `${'a'.repeat(220)}.PNG`), 'v2', 'Otro');
    expect(file.name).toHaveLength(200);
    expect(file.name.endsWith('.PNG')).toBe(true);
  });
});
