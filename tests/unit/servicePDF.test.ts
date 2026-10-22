import { describe, expect, it } from 'vitest';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import { emptyData } from '../../src/lib/localDatabase';
import { createServicePDF, type ServiceReceipt } from '../../src/lib/servicePDF';

const receipt = (): ServiceReceipt => ({
  service: {
    ...initialServices[0],
    work: 'Cambio de aceite del motor.',
    amount: 58400.75,
    notes: 'SECRETO-SERVICIO-NO-PUBLICAR',
  },
  vehicle: initialVehicles[1],
  customer: { ...initialCustomers[1], notes: 'SECRETO-CLIENTE-NO-PUBLICAR' },
  workshop: { ...emptyData().workshop, address: 'Dirección del taller 123' },
  demo: false,
});

describe('comprobantes PDF', () => {
  it('incluye el servicio elegido, datos del taller, acentos e importe con centavos sin notas privadas', async () => {
    const result = await createServicePDF(receipt());
    const pdf = Buffer.from(result.bytes).toString('latin1');
    expect(pdf).toMatch(/^%PDF-/);
    expect(result.filename).toBe('taller-calamante-AF-456-EF-2026-10-05-Cambio-de-aceite.pdf');
    for (const value of [
      'Taller Calamante',
      'Dirección del taller 123',
      'María González',
      'AF 456 EF',
      'Cambio de aceite del motor.',
      '112.300 km',
      'ARS 58.400,75',
      'Recomendación vigente',
    ])
      expect(pdf).toContain(value);
    expect(pdf).not.toContain('SECRETO-SERVICIO-NO-PUBLICAR');
    expect(pdf).not.toContain('SECRETO-CLIENTE-NO-PUBLICAR');
    expect(pdf).not.toContain('DATOS FICTICIOS');
  });

  it('agrega páginas para trabajos extensos y mantiene el final del detalle', async () => {
    const data = receipt();
    data.service.work = `${'Control completo de prueba.\n'.repeat(65)}Fin del trabajo extenso.`;
    const result = await createServicePDF(data);
    const pdf = Buffer.from(result.bytes).toString('latin1');
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    expect(pdf).toContain('Fin del trabajo extenso.');
    expect(pdf).toContain('ARS 58.400,75');
    expect(pdf).toContain('Continuación');
    expect(pdf).toContain('Página 2 de');
  });

  it('identifica los comprobantes de demostración y rechaza relaciones cruzadas', async () => {
    const data = receipt();
    data.demo = true;
    const result = await createServicePDF(data);
    expect(result.filename).toContain('-demo-');
    expect(Buffer.from(result.bytes).toString('latin1')).toContain('DATOS FICTICIOS');
    data.customer = initialCustomers[0];
    await expect(createServicePDF(data)).rejects.toThrow('no corresponden');
  });
});
