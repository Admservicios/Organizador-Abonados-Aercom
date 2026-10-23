import { z } from 'zod';
import type { Service, Vehicle } from './demo';

export const maintenancePlanSchema = z
  .strictObject({
    category: z.string().min(1).max(100),
    label: z.string().trim().min(1).max(100),
    nextDate: z.iso.date(),
    nextKm: z.number().int().min(1).max(9999999),
    recommendation: z.string().trim().min(1).max(150),
    lastDate: z.iso.date().optional(),
    lastKm: z.number().int().min(0).max(9999999).optional(),
    legacy: z.boolean().optional(),
    sourceServiceId: z.string().min(1).max(100).optional(),
    manual: z.boolean().optional(),
  })
  .superRefine((plan, context) => {
    if (
      (plan.lastDate === undefined) !== (plan.lastKm === undefined) ||
      (plan.lastDate !== undefined && plan.nextDate <= plan.lastDate) ||
      (plan.lastKm !== undefined && plan.nextKm <= plan.lastKm)
    )
      context.addIssue({
        code: 'custom',
        message: 'El vencimiento debe ser posterior al último servicio de este tipo.',
      });
  });
export type MaintenancePlan = z.infer<typeof maintenancePlanSchema>;
export type MaintenanceNext = { date: string; km: number; recommendation: string };
export type PlanStatus = 'Al día' | 'Próximo' | 'Vencido';
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
export const maintenanceTypes = [
  {
    key: 'aceite-filtros',
    label: 'Service de aceite y filtros',
    type: 'Service general',
    aliases: ['Cambio de aceite', 'Cambio de aceite y filtros', 'Aceite y filtros'],
    recommendations: ['Cambio de aceite y filtros', 'Service general'],
  },
  {
    key: 'filtros',
    label: 'Filtros',
    type: 'Filtros',
    aliases: ['Cambio de filtros'],
    recommendations: ['Cambio de filtros'],
  },
  {
    // Conserva la categoría que ya usaban los servicios personalizados con este nombre.
    key: 'otro-filtro-de-habitaculo',
    label: 'Filtro de habitáculo',
    type: 'Filtro de habitáculo',
    aliases: ['Cambio de filtro de habitáculo', 'Filtro de cabina'],
    recommendations: ['Cambio de filtro de habitáculo'],
  },
  {
    key: 'frenos',
    label: 'Frenos',
    type: 'Frenos',
    aliases: ['Revisión de frenos', 'Cambio de pastillas de freno'],
    recommendations: ['Revisión de frenos', 'Cambio de pastillas de freno'],
  },
  {
    key: 'alineacion-balanceo',
    label: 'Alineación y balanceo',
    type: 'Alineación y balanceo',
    aliases: [],
    recommendations: ['Alineación y balanceo'],
  },
  {
    key: 'neumaticos',
    label: 'Neumáticos',
    type: 'Neumáticos',
    aliases: ['Control de neumáticos', 'Rotación de neumáticos'],
    recommendations: ['Control de neumáticos', 'Rotación de neumáticos'],
  },
  {
    key: 'revision-general',
    label: 'Revisión general',
    type: 'Revisión general',
    aliases: [],
    recommendations: ['Revisión general'],
  },
];
export function maintenanceKind(type: string) {
  const name = normalize(type);
  const known = maintenanceTypes.find((kind) =>
    [kind.type, kind.label, ...kind.aliases].some((alias) => normalize(alias) === name),
  );
  if (known) return known;
  const label = type.trim().slice(0, 100) || 'Otro mantenimiento';
  return {
    key: `otro-${
      normalize(label)
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 85) || 'servicio'
    }`,
    label,
    type: label,
    aliases: [],
    recommendations: [label],
  };
}

// Un archivo anterior conserva su único vencimiento real; no se inventan intervalos perdidos.
export function vehiclePlans(vehicle: Vehicle): MaintenancePlan[] {
  if (vehicle.maintenancePlans) return vehicle.maintenancePlans;
  const kind = maintenanceKind(vehicle.recommendation);
  return [
    {
      category: kind.key,
      label: kind.label,
      recommendation: vehicle.recommendation || kind.label,
      nextDate: vehicle.nextDate,
      nextKm: vehicle.nextKm,
      legacy: true,
    },
  ];
}
export function planStatus(plan: MaintenancePlan, km: number, today: string): PlanStatus {
  if (km >= plan.nextKm || plan.nextDate <= today) return 'Vencido';
  if (
    plan.nextKm - km <= 1000 ||
    (Date.parse(`${plan.nextDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000 <= 30
  )
    return 'Próximo';
  return 'Al día';
}
export function sortPlanRows<T extends { vehicle: Vehicle; plan: MaintenancePlan }>(
  rows: T[],
  today: string,
): T[] {
  const rank = { Vencido: 0, Próximo: 1, 'Al día': 2 };
  return [...rows].sort(
    (a, b) =>
      rank[planStatus(a.plan, a.vehicle.km, today)] -
        rank[planStatus(b.plan, b.vehicle.km, today)] ||
      a.plan.nextDate.localeCompare(b.plan.nextDate) ||
      a.plan.nextKm - a.vehicle.km - (b.plan.nextKm - b.vehicle.km) ||
      a.plan.category.localeCompare(b.plan.category),
  );
}
export function nextVehiclePlan(vehicle: Vehicle, today: string) {
  return sortPlanRows(
    vehiclePlans(vehicle).map((plan) => ({ vehicle, plan })),
    today,
  )[0]?.plan;
}
export function vehiclePlanStatus(vehicle: Vehicle, today: string): PlanStatus | 'Sin datos' {
  const plan = nextVehiclePlan(vehicle, today);
  return plan ? planStatus(plan, vehicle.km, today) : 'Sin datos';
}
export function allPlanRows(vehicles: Vehicle[], today: string) {
  return sortPlanRows(
    vehicles.flatMap((vehicle) => vehiclePlans(vehicle).map((plan) => ({ vehicle, plan }))),
    today,
  );
}
export function servicePlan(service: Service, next: MaintenanceNext): MaintenancePlan {
  const kind = maintenanceKind(service.type);
  return maintenancePlanSchema.parse({
    category: kind.key,
    label: kind.label,
    recommendation: next.recommendation,
    nextDate: next.date,
    nextKm: next.km,
    lastDate: service.date,
    lastKm: service.km,
    sourceServiceId: service.id,
  });
}
export function withPlanSummary(vehicle: Vehicle, today: string): Vehicle {
  const plan = nextVehiclePlan(vehicle, today);
  if (!plan) return vehicle;
  return {
    ...vehicle,
    nextDate: plan.nextDate,
    nextKm: plan.nextKm,
    recommendation: plan.recommendation,
  };
}
export function recordServicePlan(
  vehicle: Vehicle,
  service: Service,
  next: MaintenanceNext,
  today: string,
  history: Service[] = [],
): Vehicle {
  const updated = servicePlan(service, next);
  const plans = vehiclePlans(vehicle).map((plan) => {
    if (vehicle.maintenancePlans || plan.lastDate) return plan;
    const last = history
      .filter((s) => s.vehicleId === vehicle.id && maintenanceKind(s.type).key === plan.category)
      .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)[0];
    return last && last.date < plan.nextDate && last.km < plan.nextKm
      ? { ...plan, lastDate: last.date, lastKm: last.km }
      : plan;
  });
  const maintained = plans.some((p) => p.category === updated.category)
    ? plans.map((p) => (p.category === updated.category ? updated : p))
    : [...plans, updated];
  return withPlanSummary(
    {
      ...vehicle,
      manualKm:
        vehicle.manualKm ??
        (vehicle.km >
        Math.max(0, ...history.filter((s) => s.vehicleId === vehicle.id).map((s) => s.km))
          ? vehicle.km
          : 0),
      km: service.km,
      maintenancePlans: maintained,
    },
    today,
  );
}

export function planServiceURL(vehicle: Vehicle, plan: MaintenancePlan) {
  return `/mantenimientos/nuevo?vehiculo=${encodeURIComponent(vehicle.id)}&servicio=${encodeURIComponent(plan.category)}`;
}
