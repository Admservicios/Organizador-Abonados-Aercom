import { describe, expect, it } from 'vitest';
import { changeServiceStatus, recordServiceChange } from '../../src/lib/serviceHistory';
import {
  initialCustomers,
  initialServices,
  initialVehicles,
  maintenanceStatus,
  type Service,
} from '../../src/lib/demo';
import {
  emptyData,
  newDatabase,
  makeBackup,
  parseBackup,
  type LocalData,
} from '../../src/lib/localDatabase';
import { servicePlan, vehiclePlans, recordServicePlan } from '../../src/lib/maintenancePlans';
import { editServiceData, editableServicePlan } from '../../src/lib/serviceEditing';

const today = '2026-10-23';
const first: Service = {
  ...initialServices[0],
  id: 'oil1',
  vehicleId: 'v2',
  type: 'Cambio de aceite',
  date: '2026-01-10',
  km: 10000,
};
first.maintenance = servicePlan(first, {
  date: '2026-07-10',
  km: 20000,
  recommendation: 'Cambio de aceite y filtros',
});
const brakes: Service = { ...first, id: 'brakes', type: 'Frenos', date: '2026-02-10', km: 13000 };
brakes.maintenance = servicePlan(brakes, {
  date: '2027-02-10',
  km: 43000,
  recommendation: 'Revisión de frenos',
});
const second: Service = { ...first, id: 'oil2', date: '2026-03-10', km: 18000 };
second.maintenance = servicePlan(second, {
  date: '2026-09-10',
  km: 28000,
  recommendation: 'Cambio de aceite y filtros',
});
function fixture(history = [first, brakes]): LocalData {
  return {
    ...emptyData(),
    customers: initialCustomers,
    vehicles: [
      {
        ...initialVehicles[1],
        manualKm: 0,
        km: Math.max(...history.map((s) => s.km)),
        maintenancePlans: [
          history.filter((s) => s.type === 'Cambio de aceite').at(-1)!.maintenance!,
          brakes.maintenance!,
        ],
      },
      { ...initialVehicles[0], km: 0, manualKm: 0, maintenancePlans: [] },
    ],
    services: history,
  };
}
function correction(original: Service, changes: Partial<Service>) {
  const service = { ...original, ...changes };
  if (service.maintenance)
    service.maintenance = servicePlan(service, {
      date: service.maintenance.nextDate,
      km: service.maintenance.nextKm,
      recommendation: service.maintenance.recommendation,
    });
  return service;
}
describe('corrección de mantenimientos y relaciones', () => {
  it('corrige importe y detalle en el mismo ID y conserva los demás registros', () => {
    const data = fixture();
    const edited = correction(first, {
      amount: 12345,
      work: 'Trabajo corregido',
      supplies: 'Filtro de habitáculo',
      notes: 'Nota corregida',
    });
    const result = editServiceData(data, first, edited, today);
    expect(result.services).toHaveLength(2);
    expect(result.services[0]).toEqual(edited);
    expect(result.services[1]).toBe(brakes);
    expect(result.vehicles[0].maintenancePlans).toEqual(data.vehicles[0].maintenancePlans);
    expect(parseBackup(JSON.stringify(makeBackup(result))).data).toEqual(result);
  });
  it('corrige la última lectura, recalcula recorridos y conserva los objetivos de aceite', () => {
    const result = editServiceData(fixture(), brakes, correction(brakes, { km: 12000 }), today);
    expect(result.vehicles[0].km).toBe(12000);
    expect(vehiclePlans(result.vehicles[0]).find((p) => p.category === 'aceite-filtros')).toEqual(
      first.maintenance,
    );
    expect(vehiclePlans(result.vehicles[0]).find((p) => p.category === 'frenos')?.lastKm).toBe(
      12000,
    );
  });
  it('registrar otra visita no convierte la lectura de un servicio antiguo en una lectura manual', () => {
    const data = fixture();
    delete data.vehicles[0].manualKm;
    const nextOil = correction(second, { km: 20000 });
    data.vehicles[0] = recordServicePlan(
      data.vehicles[0],
      nextOil,
      { date: '2026-09-10', km: 30000, recommendation: 'Cambio de aceite y filtros' },
      today,
      data.services,
    );
    data.services.push(nextOil);
    const step = editServiceData(data, brakes, correction(brakes, { km: 12000 }), today);
    expect(
      editServiceData(step, nextOil, correction(nextOil, { km: 12500 }), today).vehicles[0].km,
    ).toBe(12500);
  });
  it('conserva una lectura independiente ingresada en la ficha', () => {
    const data = fixture();
    data.vehicles[0].manualKm = 15000;
    data.vehicles[0].km = 15000;
    expect(
      editServiceData(data, brakes, correction(brakes, { km: 12000 }), today).vehicles[0].km,
    ).toBe(15000);
  });
  it('editar una visita antigua no reinicia un vencimiento posterior del mismo tipo', () => {
    const data = fixture([first, brakes, second]);
    const result = editServiceData(data, first, correction(first, { km: 9000 }), today);
    expect(result.vehicles[0].km).toBe(18000);
    expect(vehiclePlans(result.vehicles[0]).find((p) => p.category === 'aceite-filtros')).toEqual(
      second.maintenance,
    );
  });
  it('un ajuste manual de recordatorios conserva prioridad', () => {
    const data = fixture();
    data.vehicles[0].maintenancePlans![1] = { ...brakes.maintenance!, manual: true, nextKm: 50000 };
    const result = editServiceData(data, brakes, correction(brakes, { km: 12000 }), today);
    expect(result.vehicles[0].maintenancePlans![1]).toEqual(data.vehicles[0].maintenancePlans![1]);
    expect(result.vehicles[0].km).toBe(13000); // Lectura manual confirmada del vencimiento.
  });
  it('mueve el servicio y sus referencias fotográficas sin duplicar y sin mover los documentos del vehículo', () => {
    const data = fixture();
    const result = editServiceData(data, brakes, correction(brakes, { vehicleId: 'v1' }), today);
    expect(result.services.find((s) => s.id === brakes.id)?.vehicleId).toBe('v1');
    expect(result.vehicles[0].km).toBe(10000);
    expect(result.vehicles[1].km).toBe(13000);
    expect(vehiclePlans(result.vehicles[0]).map((p) => p.category)).toEqual(['aceite-filtros']);
    expect(vehiclePlans(result.vehicles[1])[0].category).toBe('frenos');
  });
  it('cambiar el tipo retira el vencimiento antiguo y crea el nuevo sin reiniciar aceite', () => {
    const result = editServiceData(
      fixture(),
      brakes,
      correction(brakes, { type: 'Filtro de habitáculo' }),
      today,
    );
    expect(vehiclePlans(result.vehicles[0]).map((p) => p.category)).toEqual([
      'aceite-filtros',
      'otro-filtro-de-habitaculo',
    ]);
  });
  it('si una visita pasa a ser anterior a otra, el vigente vuelve al servicio posterior', () => {
    const data = fixture([first, brakes, second]);
    const edited = correction(second, { date: '2026-01-01', km: 5000 });
    const result = editServiceData(data, second, edited, today);
    expect(vehiclePlans(result.vehicles[0]).find((p) => p.category === 'aceite-filtros')).toEqual(
      first.maintenance,
    );
  });
  it('si no quedan vencimientos, muestra Sin datos en vez de resucitar el vencimiento retirado', () => {
    const data = fixture();
    data.services = [brakes];
    data.vehicles[0].maintenancePlans = [brakes.maintenance!];
    const result = editServiceData(data, brakes, correction(brakes, { vehicleId: 'v1' }), today);
    expect(vehiclePlans(result.vehicles[0])).toEqual([]);
    expect(maintenanceStatus(result.vehicles[0], today)).toBe('Sin datos');
    expect(() => newDatabase(result)).not.toThrow();
  });
  it('conserva una lectura previa desconocida cuando se mueve la única visita de una base antigua', () => {
    const data = fixture();
    data.services = [brakes];
    data.vehicles[0].maintenancePlans = [brakes.maintenance!];
    delete data.vehicles[0].manualKm;
    expect(
      editServiceData(data, brakes, correction(brakes, { vehicleId: 'v1' }), today).vehicles[0].km,
    ).toBe(13000);
  });
  it('rechaza kilómetros incompatibles con visitas anteriores y posteriores sin mutar la base', () => {
    const data = fixture();
    const before = structuredClone(data);
    expect(() => editServiceData(data, brakes, correction(brakes, { km: 9999 }), today)).toThrow(
      'contradice',
    );
    expect(() => editServiceData(data, first, correction(first, { km: 14000 }), today)).toThrow(
      'contradice',
    );
    expect(data).toEqual(before);
  });
  it('rechaza un formulario obsoleto o una fecha futura', () => {
    const data = fixture();
    data.services[0] = { ...first, amount: 123 };
    expect(() => editServiceData(data, first, first, today)).toThrow('otra pestaña');
    expect(() =>
      editServiceData(fixture(), brakes, correction(brakes, { date: '2026-12-01' }), today),
    ).toThrow('futura');
  });
  it('no inventa vencimientos perdidos en archivos antiguos', () => {
    const data = fixture();
    const old = { ...first };
    delete old.maintenance;
    data.services[0] = old;
    const oldVehicle = { ...data.vehicles[0] };
    delete oldVehicle.maintenancePlans;
    data.vehicles[0] = oldVehicle;
    expect(editableServicePlan(old, data)).toBeUndefined();
    const result = editServiceData(data, old, { ...old, amount: 12 }, today);
    expect(result.services[0].maintenance).toBeUndefined();
  });
});

describe('anulación y recuperación de mantenimientos', () => {
  it('anular la última visita de aceite recupera su vencimiento anterior sin tocar frenos', () => {
    const data = fixture([first, brakes, second]);
    const result = changeServiceStatus(data, second, 'Visita duplicada', today);
    expect(result.vehicles[0].km).toBe(13000);
    expect(vehiclePlans(result.vehicles[0])).toEqual([first.maintenance, brakes.maintenance]);
    expect(result.services).toHaveLength(3);
    expect(result.services[2].annulment?.reason).toBe('Visita duplicada');
    expect(result.services[2].changes?.at(-1)?.action).toBe('annulled');
    expect(data.services[2].annulment).toBeUndefined();
    expect(parseBackup(JSON.stringify(makeBackup(result))).data).toEqual(result);
    const recovered = changeServiceStatus(result, result.services[2], 'Visita confirmada', today);
    expect(recovered.vehicles[0].km).toBe(18000);
    expect(vehiclePlans(recovered.vehicles[0])).toEqual([second.maintenance, brakes.maintenance]);
    expect(recovered.services[2].annulment).toBeUndefined();
    expect(recovered.services[2].changes?.map((c) => c.action)).toEqual(['annulled', 'restored']);
  });
  it('anular un servicio anterior no reinicia el vencimiento más reciente de ese tipo', () => {
    const result = changeServiceStatus(
      fixture([first, brakes, second]),
      first,
      'Registro incorrecto',
      today,
    );
    expect(result.vehicles[0].km).toBe(18000);
    expect(result.vehicles[0].maintenancePlans?.[0]).toEqual(second.maintenance);
    const restored = changeServiceStatus(result, result.services[0], 'Registro verificado', today);
    expect(restored.vehicles[0].maintenancePlans).toEqual(result.vehicles[0].maintenancePlans);
  });
  it('anular el único servicio retira el vencimiento sin inventar uno y conserva la lectura manual', () => {
    const data = fixture();
    data.services = [brakes];
    data.vehicles[0].maintenancePlans = [brakes.maintenance!];
    data.vehicles[0].manualKm = 5000;
    const result = changeServiceStatus(data, brakes, 'Carga equivocada', today);
    expect(result.vehicles[0].km).toBe(5000);
    expect(vehiclePlans(result.vehicles[0])).toEqual([]);
    expect(maintenanceStatus(result.vehicles[0], today)).toBe('Sin datos');
    expect(() => newDatabase(result)).not.toThrow(); // El archivo anulado conserva sus 13.000 km.
  });
  it('conserva el vencimiento y la lectura de un ajuste manual', () => {
    const data = fixture();
    data.vehicles[0].manualKm = 15000;
    data.vehicles[0].km = 15000;
    data.vehicles[0].maintenancePlans![1] = { ...brakes.maintenance!, manual: true, nextKm: 50000 };
    const result = changeServiceStatus(data, brakes, 'Servicio duplicado', today);
    expect(result.vehicles[0].km).toBe(15000);
    expect(result.vehicles[0].maintenancePlans).toEqual(data.vehicles[0].maintenancePlans);
    const recovered = changeServiceStatus(result, result.services[1], 'Servicio verificado', today);
    expect(recovered.vehicles[0].maintenancePlans).toEqual(data.vehicles[0].maintenancePlans);
  });
  it('no usa registros anulados para rechazar una corrección y sí valida al recuperarlos', () => {
    const data = changeServiceStatus(fixture(), brakes, 'Kilómetros incorrectos', today);
    const edited = correction(first, { km: 14000 });
    const corrected = editServiceData(data, first, edited, today);
    const before = structuredClone(corrected);
    expect(() =>
      changeServiceStatus(corrected, corrected.services[1], 'Recuperar registro', today),
    ).toThrow('contradice');
    expect(corrected).toEqual(before);
  });
  it('rechaza motivos vacíos, estados obsoletos y metadatos dañados sin cambiar los datos', () => {
    const data = fixture();
    expect(() => changeServiceStatus(data, brakes, '  ', today)).toThrow('motivo');
    const result = changeServiceStatus(data, brakes, 'Carga duplicada', today);
    expect(() => changeServiceStatus(result, brakes, 'Carga duplicada', today)).toThrow(
      'otra pestaña',
    );
    const invalid = structuredClone(result);
    invalid.services[1].annulment!.at = 'ayer';
    expect(() => newDatabase(invalid)).toThrow();
  });
  it('registra valores previos y nuevos y conserva toda la cadena al editar otra vez', () => {
    const firstEdit = recordServiceChange(
      first,
      { ...first, amount: 123, notes: 'Nota corregida' },
      'edited',
    );
    expect(firstEdit.changes?.[0].changes).toContainEqual({
      field: 'Importe',
      before: String(first.amount),
      after: '123',
    });
    const secondEdit = recordServiceChange(firstEdit, { ...firstEdit, amount: 456 }, 'edited');
    expect(secondEdit.changes).toHaveLength(2);
    expect(secondEdit.changes?.[1].changes).toEqual([
      { field: 'Importe', before: '123', after: '456' },
    ]);
    expect(first.changes).toBeUndefined();
  });
});
