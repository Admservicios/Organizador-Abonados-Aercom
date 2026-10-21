import { describe, expect, it } from 'vitest';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import {
  DATABASE_KEY,
  SAFETY_COPY_KEY,
  emptyData,
  loadDatabase,
  makeBackup,
  newDatabase,
  parseBackup,
  persistDatabase,
  type StoragePort,
} from '../../src/lib/localDatabase';

function storage(initial?: string): StoragePort & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(DATABASE_KEY, initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
const sample = () => ({
  ...emptyData(),
  customers: structuredClone(initialCustomers),
  vehicles: structuredClone(initialVehicles),
  services: structuredClone(initialServices),
});
describe('base local versionada', () => {
  it('inicia vacía sin copiar datos ficticios ni escribir automáticamente', () => {
    const port = storage();
    const loaded = loadDatabase(port);
    expect(loaded.database.data.customers).toEqual([]);
    expect(port.values.size).toBe(0);
  });
  it('guarda clientes, vehículos y servicios como una unidad y los recupera', () => {
    const port = storage();
    const data = sample();
    persistDatabase(port, null, data, 0);
    expect(loadDatabase(port).database.data).toEqual(data);
    expect(loadDatabase(port).database.revision).toBe(1);
  });
  it.each(['{incompleto', JSON.stringify({ ...newDatabase(), version: 99 })])(
    'preserva datos dañados o versiones desconocidas',
    (raw) => {
      const port = storage(raw);
      expect(loadDatabase(port).error).not.toBeNull();
      expect(port.getItem(DATABASE_KEY)).toBe(raw);
    },
  );
  it('rechaza una escritura basada en una revisión anterior', () => {
    const port = storage();
    persistDatabase(port, null, sample(), 0);
    expect(() => persistDatabase(port, null, emptyData(), 0)).toThrow('otra pestaña');
    expect(loadDatabase(port).database.data.customers).toHaveLength(8);
  });
  it('propaga el fallo de almacenamiento y conserva el dato anterior', () => {
    const raw = JSON.stringify(newDatabase(sample()));
    const port = storage(raw);
    port.setItem = () => {
      throw new Error('quota');
    };
    expect(() => persistDatabase(port, raw, emptyData(), 0)).toThrow('quota');
    expect(port.getItem(DATABASE_KEY)).toBe(raw);
  });
});
describe('exportación y restauración', () => {
  it('acepta una copia interna válida para recuperar el estado previo a una restauración', () => {
    const database = newDatabase(sample());
    const backup = parseBackup(JSON.stringify(database));
    expect(backup.data).toEqual(database.data);
    expect(backup.exportedAt).toBe(database.updatedAt);
  });
  it('completa un recorrido de exportación, modificación y restauración', () => {
    const data = sample();
    const backup = parseBackup(JSON.stringify(makeBackup(data)));
    const port = storage();
    const modified = persistDatabase(port, null, emptyData(), 0);
    persistDatabase(port, modified.raw, backup.data, modified.database.revision, true);
    expect(loadDatabase(port).database.data).toEqual(data);
    expect(port.getItem(SAFETY_COPY_KEY)).toBe(modified.raw);
  });
  it('no reemplaza la base si no puede conservar la copia previa', () => {
    const raw = JSON.stringify(newDatabase(sample()));
    const port = storage(raw);
    const originalSet = port.setItem;
    port.setItem = (key, value) => {
      if (key === SAFETY_COPY_KEY) throw new Error('quota');
      originalSet(key, value);
    };
    expect(() => persistDatabase(port, raw, emptyData(), 0, true)).toThrow('quota');
    expect(port.getItem(DATABASE_KEY)).toBe(raw);
  });
  it.each([
    () => ({ ...makeBackup(sample()), version: 99 }),
    () => ({ ...makeBackup(sample()), password: 'no debe incluirse' }),
    () => {
      const data = sample();
      data.vehicles[0].customerId = 'inexistente';
      return { ...makeBackup(emptyData()), data };
    },
    () => {
      const data = sample();
      data.customers.push({ ...data.customers[0] });
      return { ...makeBackup(emptyData()), data };
    },
    () => {
      const data = sample();
      data.vehicles[1].plate = 'AB123CD';
      return { ...makeBackup(emptyData()), data };
    },
    () => {
      const data = sample();
      data.services[0].km = 9999999;
      return { ...makeBackup(emptyData()), data };
    },
  ])('rechaza respaldos incompatibles o con relaciones inválidas', (factory) => {
    expect(() => parseBackup(JSON.stringify(factory()))).toThrow('Respaldo inválido');
  });
  it('limita el tamaño del archivo antes de interpretar JSON', () => {
    expect(() => parseBackup(' '.repeat(5 * 1024 * 1024 + 1))).toThrow('5 MB');
  });
});
