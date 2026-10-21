import { describe, expect, it } from 'vitest';
import {
  customerCSV,
  initialCustomers,
  initialVehicles,
  maintenanceStatus,
} from '../../src/lib/demo';
import { serviceSchema } from '../../src/lib/serviceValidation';

describe('recomendaciones de mantenimiento', () => {
  const vehicle = { ...initialVehicles[0], km: 50000, nextKm: 60000, nextDate: '2026-12-01' };
  it('está al día cuando aún no se alcanza ninguna ventana de aviso', () => {
    expect(maintenanceStatus(vehicle, '2026-10-21')).toBe('Al día');
  });
  it('avisa 30 días antes de la fecha aunque queden muchos kilómetros', () => {
    expect(maintenanceStatus({ ...vehicle, nextDate: '2026-11-20' }, '2026-10-21')).toBe('Próximo');
  });
  it('avisa a 1.000 km aunque falten varios meses', () => {
    expect(maintenanceStatus({ ...vehicle, km: 59000 }, '2026-10-21')).toBe('Próximo');
  });
  it.each([
    { ...vehicle, nextDate: '2026-10-20' },
    { ...vehicle, km: 60000 },
  ])('vence al alcanzar uno de los dos límites', (v) => {
    expect(maintenanceStatus(v, '2026-10-21')).toBe('Vencido');
  });
});
describe('validación de mantenimiento', () => {
  const input = {
    date: '2026-10-21',
    km: 50000,
    type: 'Service general',
    work: 'Cambio de aceite y filtros',
    amount: 95300,
    nextDate: '2027-04-21',
    nextKm: 60000,
  };
  it('acepta un servicio y una recomendación posterior', () =>
    expect(serviceSchema.safeParse(input).success).toBe(true));
  it.each([
    { ...input, nextKm: 50000 },
    { ...input, nextDate: input.date },
    { ...input, amount: -10 },
    { ...input, date: '2026-99-99' },
    { ...input, work: ' ' },
  ])('rechaza recomendaciones e importes inválidos', (value) => {
    expect(serviceSchema.safeParse(value).success).toBe(false);
  });
});
describe('exportación de clientes', () => {
  it('escapa comillas y neutraliza fórmulas en hojas de cálculo', () => {
    const csv = customerCSV([
      { ...initialCustomers[0], name: '=HYPERLINK("ejemplo")', phone: '+54 11 1234' },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""ejemplo"")"');
    expect(csv).toContain('"\'+54 11 1234"');
    expect(csv).not.toContain(initialCustomers[0].notes);
  });
});
