import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import { emptyData, makeBackup, newDatabase, parseBackup } from '../../src/lib/localDatabase';
import { createPhotoBackup, parsePhotoBackup } from '../../src/lib/photoBackup';
import { jpegDimensions, photoHash, type StoredPhoto } from '../../src/lib/photos';

async function sample() {
  const bytes = await readFile(new URL('../fixtures/foto-prueba.jpg', import.meta.url));
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
  const photo: StoredPhoto = {
    id: '6da6a29f-4137-4bd2-a244-91ab57eb7c89',
    setId: 'f07fa5c7-372f-4d27-b484-85b65bf25726',
    serviceId: initialServices[0].id,
    name: 'foto-prueba.jpg',
    width: 24,
    height: 16,
    size: blob.size,
    sha256: await photoHash(blob),
    data: blob,
  };
  const { data: _blob, setId: _set, ...ref } = photo;
  const data = {
    ...emptyData(),
    customers: initialCustomers,
    vehicles: initialVehicles,
    services: initialServices,
    photoSet: photo.setId,
    photos: [ref],
  };
  return { photo, data };
}

describe('fotos y respaldos completos', () => {
  it('comprueba dimensiones JPEG antes de decodificar y rechaza encabezados excesivos', async () => {
    const { photo } = await sample();
    const bytes = new Uint8Array(await photo.data.arrayBuffer());
    expect(jpegDimensions(bytes)).toEqual({ width: 24, height: 16 });
    const frame = bytes.findIndex((value, index) => value === 255 && bytes[index + 1] === 0xc0);
    bytes[frame + 7] = 0x40;
    expect(() => jpegDimensions(bytes)).toThrow('dimensiones');
  });
  it('conserva el formato anterior sin fotos y añade referencias validadas sin codificar archivos en JSON', async () => {
    expect(parseBackup(JSON.stringify(makeBackup(emptyData()))).data).toEqual(emptyData());
    const { data } = await sample();
    expect(parseBackup(JSON.stringify(makeBackup(data))).data).toEqual(data);
    expect(JSON.stringify(newDatabase(data))).not.toContain('base64');
    const invalid = structuredClone(data);
    invalid.photos[0].serviceId = 'inexistente';
    expect(() => makeBackup(invalid)).toThrow();
    expect(() => makeBackup({ ...data, photoSet: undefined })).toThrow();
  });
  it('exporta registros y bytes de fotos, verifica la integridad e importa el ZIP completo', async () => {
    const { data, photo } = await sample();
    const zip = await createPhotoBackup(data, [photo]);
    const parsed = await parsePhotoBackup(new Uint8Array(await zip.arrayBuffer()));
    expect(parsed.backup.data).toEqual(data);
    expect(parsed.photos).toHaveLength(1);
    expect(await photoHash(parsed.photos[0].data)).toBe(photo.sha256);
    expect(parsed.photos[0].serviceId).toBe(photo.serviceId);
  });
  it('acepta el ZIP de práctica con un único JSON anterior y sin archivos', async () => {
    const bytes = zipSync({
      'taller-calamante-practica.json': strToU8(JSON.stringify(makeBackup(emptyData()))),
    });
    const parsed = await parsePhotoBackup(bytes);
    expect(parsed.photos).toEqual([]);
    expect(parsed.backup.data).toEqual(emptyData());
  });
  it('rechaza archivos ausentes, adulterados o ajenos al respaldo', async () => {
    const { data, photo } = await sample();
    const valid = new Uint8Array(await (await createPhotoBackup(data, [photo])).arrayBuffer());
    const entries = unzipSync(valid);
    const path = `photos/${photo.id}.jpg`;
    const modified = { ...entries, [path]: new Uint8Array(entries[path]) };
    modified[path][100] ^= 1;
    await expect(parsePhotoBackup(zipSync(modified))).rejects.toThrow('integridad');
    await expect(
      parsePhotoBackup(zipSync({ 'backup.json': entries['backup.json'] })),
    ).rejects.toThrow();
    await expect(
      parsePhotoBackup(zipSync({ ...entries, 'sorpresa.txt': strToU8('otro') })),
    ).rejects.toThrow();
    await expect(createPhotoBackup(data, [])).rejects.toThrow('Faltan fotos');
  });
  it('rechaza expansión excesiva de un ZIP antes de descomprimir sus archivos', async () => {
    const compressed = zipSync({ 'backup.json': new Uint8Array(5 * 1024 * 1024 + 1) });
    expect(compressed.length).toBeLessThan(10000);
    await expect(parsePhotoBackup(compressed)).rejects.toThrow('tamaño permitido');
  });
});
