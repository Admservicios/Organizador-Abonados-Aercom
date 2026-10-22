import { describe, expect, it } from 'vitest';
import {
  initialCustomers,
  initialServices,
  initialVehicles,
  maintenanceStatus,
  type Service,
} from '../../src/lib/demo';
import {
  allPlanRows,
  maintenanceKind,
  recordServicePlan,
  servicePlan,
  vehiclePlans,
} from '../../src/lib/maintenancePlans';
import { emptyData, makeBackup, newDatabase, parseBackup } from '../../src/lib/localDatabase';
import { createServicePDF } from '../../src/lib/servicePDF';

const today = '2026-10-22';
const vehicle = initialVehicles[1];
const brakes: Service = {
  ...initialServices[0],
  id: 'test-frenos',
  type: 'Frenos',
  date: today,
  km: 121000,
  work: 'Cambio de pastillas delanteras.',
  public: false,
};
const brakeNext = { date: '2027-10-22', km: 151000, recommendation: 'Revisión de frenos' };

describe('vencimientos independientes por servicio', () => {
  it('un cambio de pastillas actualiza el odómetro sin mover fecha, km ni último servicio de aceite', () => {
    const updated = recordServicePlan(vehicle, brakes, brakeNext, today, initialServices);
    expect(updated.km).toBe(121000);
    const oil = vehiclePlans(updated).find((p) => p.category === 'aceite-filtros')!;
    expect(oil).toMatchObject({
      nextDate: vehicle.nextDate,
      nextKm: vehicle.nextKm,
      lastDate: initialServices[0].date,
      lastKm: initialServices[0].km,
    });
    expect(vehiclePlans(updated).find((p) => p.category === 'frenos')).toMatchObject({
      nextKm: 151000,
      lastKm: 121000,
      lastDate: today,
    });
    expect(vehicle.nextKm).toBe(122300);
  });
  it('detecta aceite vencido por el nuevo odómetro aunque frenos esté al día y venza mucho después', () => {
    const updated = recordServicePlan(
      vehicle,
      { ...brakes, km: 123000 },
      brakeNext,
      today,
      initialServices,
    );
    expect(maintenanceStatus(updated, today)).toBe('Vencido');
    const rows = allPlanRows([updated], today);
    expect(rows[0].plan.category).toBe('aceite-filtros');
    expect(updated.nextKm).toBe(122300);
    expect(rows).toHaveLength(2);
  });
  it('renovar aceite cambia solo aceite y conserva el control de frenos y alineación', () => {
    const withBrakes = recordServicePlan(vehicle, brakes, brakeNext, today, initialServices);
    const alignment = {
      ...brakes,
      id: 'test-alineacion',
      type: 'Alineación y balanceo',
      km: 121100,
    };
    const withBoth = recordServicePlan(
      withBrakes,
      alignment,
      { ...brakeNext, km: 131100, recommendation: 'Alineación y balanceo' },
      today,
    );
    const kept = vehiclePlans(withBoth).filter((p) => p.category !== 'aceite-filtros');
    const oil = { ...brakes, id: 'test-aceite', type: 'Cambio de aceite', km: 122000 };
    const updated = recordServicePlan(
      withBoth,
      oil,
      { date: '2027-04-22', km: 132000, recommendation: 'Cambio de aceite y filtros' },
      today,
    );
    expect(vehiclePlans(updated).filter((p) => p.category !== 'aceite-filtros')).toEqual(kept);
    expect(vehiclePlans(updated).find((p) => p.category === 'aceite-filtros')).toMatchObject({
      lastKm: 122000,
      nextKm: 132000,
      lastDate: today,
    });
    expect(vehiclePlans(updated)).toHaveLength(3);
  });
  it('filtros solos y servicios personalizados no reinician aceite ni otros trabajos personalizados', () => {
    expect(maintenanceKind('Filtros').key).not.toBe(maintenanceKind('Cambio de aceite').key);
    expect(maintenanceKind('Filtro de aire').key).not.toBe(
      maintenanceKind('Filtro de combustible').key,
    );
    expect(maintenanceKind('Aceite de caja').key).not.toBe(maintenanceKind('Cambio de aceite').key);
  });
  it('conserva el único vencimiento anterior sin inventar los intervalos ya sobrescritos', () => {
    const old = { ...vehicle, recommendation: 'Revisión de frenos' };
    expect(vehiclePlans(old)).toHaveLength(1);
    expect(vehiclePlans(old)[0]).toMatchObject({
      legacy: true,
      nextDate: old.nextDate,
      nextKm: old.nextKm,
    });
    expect(vehiclePlans(old)[0].lastKm).toBeUndefined();
  });
  it('exporta y restaura planes y el vencimiento histórico del servicio; rechaza categorías repetidas', () => {
    const updated = recordServicePlan(vehicle, brakes, brakeNext, today, initialServices);
    const service = { ...brakes, maintenance: servicePlan(brakes, brakeNext) };
    const data = {
      ...emptyData(),
      customers: initialCustomers,
      vehicles: [updated],
      services: [service],
    };
    expect(parseBackup(JSON.stringify(makeBackup(data))).data).toEqual(data);
    expect(() =>
      newDatabase({
        ...data,
        vehicles: [
          {
            ...updated,
            maintenancePlans: [...updated.maintenancePlans!, updated.maintenancePlans![0]],
          },
        ],
      }),
    ).toThrow('vencimientos');
  });
  it('el PDF de frenos usa su propio vencimiento en lugar del vencimiento general de aceite', async () => {
    const service = { ...brakes, maintenance: servicePlan(brakes, brakeNext) };
    const updated = recordServicePlan(vehicle, brakes, brakeNext, today);
    const pdf = Buffer.from(
      (
        await createServicePDF({
          service,
          vehicle: updated,
          customer: initialCustomers[1],
          workshop: emptyData().workshop,
          demo: false,
        })
      ).bytes,
    ).toString('latin1');
    expect(pdf).toContain('151.000 km');
    expect(pdf).toContain('Vencimiento registrado al realizar este servicio.');
    expect(pdf).not.toContain('122.300 km');
  });
});
