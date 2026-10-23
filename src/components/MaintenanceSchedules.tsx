import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Pencil, Plus } from 'lucide-react';
import { Badge, Modal, ModalCancelButton, Panel } from './ui';
import { useData } from '../app/store';
import { dateLabel, number, type Vehicle } from '../lib/demo';
import { nextServiceDate } from '../lib/localDatabase';
import {
  maintenanceKind,
  maintenancePlanSchema,
  maintenanceTypes,
  planServiceURL,
  planStatus,
  vehiclePlans,
  type MaintenancePlan,
} from '../lib/maintenancePlans';

function ScheduleEditor({
  vehicle,
  plan,
  close,
}: {
  vehicle: Vehicle;
  plan?: MaintenancePlan;
  close: () => void;
}) {
  const { activeServices: services, saveVehicle, notify, referenceDate, mode } = useData();
  const plans = vehiclePlans(vehicle);
  const initialKind = plan
    ? (maintenanceTypes.find((k) => k.key === plan.category) ?? maintenanceKind(plan.label))
    : (maintenanceTypes.find((k) => !plans.some((p) => p.category === k.key)) ??
      maintenanceKind('Otro mantenimiento'));
  const [type, setType] = useState(
    maintenanceTypes.some((k) => k.type === initialKind.type)
      ? initialKind.type
      : 'Otro mantenimiento',
  );
  const [name, setName] = useState(plan?.label ?? '');
  const kind = maintenanceKind(type === 'Otro mantenimiento' ? name : type);
  const lastOf = (key: string) =>
    services
      .filter((s) => s.vehicleId === vehicle.id && maintenanceKind(s.type).key === key)
      .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)[0];
  const initialLast = lastOf(initialKind.key);
  const [lastDate, setLastDate] = useState(plan?.lastDate ?? initialLast?.date ?? '');
  const [lastKm, setLastKm] = useState(String(plan?.lastKm ?? initialLast?.km ?? ''));
  const [nextDate, setNextDate] = useState(plan?.nextDate ?? nextServiceDate(referenceDate));
  const [nextKm, setNextKm] = useState(String(plan?.nextKm ?? vehicle.km + 10000));
  const [recommendation, setRecommendation] = useState(
    plan?.recommendation ?? initialKind.recommendations[0],
  );
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = maintenancePlanSchema.safeParse({
      manual: true,
      category: kind.key,
      label: kind.label,
      nextDate,
      nextKm: Number(nextKm),
      recommendation,
      ...(lastDate || lastKm
        ? { lastDate: lastDate || undefined, lastKm: lastKm ? Number(lastKm) : undefined }
        : {}),
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    if (
      (result.data.lastDate && result.data.lastDate > referenceDate) ||
      (result.data.lastKm !== undefined && result.data.lastKm > vehicle.km)
    ) {
      setError(
        'El último servicio no puede ser futuro ni superar el kilometraje actual del vehículo.',
      );
      return;
    }
    if (plans.some((p) => p.category !== plan?.category && p.category === result.data.category)) {
      setError('Este servicio ya tiene un vencimiento. Usá Editar para corregirlo.');
      return;
    }
    const next = plan
      ? plans.map((p) => (p.category === plan.category ? result.data : p))
      : [...plans, result.data];
    if (!(await saveVehicle({ ...vehicle, maintenancePlans: next }))) return;
    notify(
      mode === 'demo'
        ? 'Vencimiento actualizado en la demo.'
        : 'Vencimiento actualizado sin modificar el historial ni los otros servicios.',
    );
    close();
  };
  return (
    <Modal title={plan ? 'Editar vencimiento' : 'Agregar vencimiento'} close={close}>
      <form className="form-stack" onSubmit={submit}>
        <p className="muted">
          Ajusta este vencimiento; no registra un mantenimiento ni modifica otros servicios.
        </p>
        <label>
          Tipo de servicio
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              const nextKind = maintenanceKind(
                e.target.value === 'Otro mantenimiento' ? name : e.target.value,
              );
              const last = lastOf(nextKind.key);
              setLastDate(last?.date ?? '');
              setLastKm(String(last?.km ?? ''));
              setRecommendation(nextKind.recommendations[0]);
            }}
          >
            {maintenanceTypes.map((k) => (
              <option key={k.key}>{k.type}</option>
            ))}
            <option>Otro mantenimiento</option>
          </select>
        </label>
        {type === 'Otro mantenimiento' && (
          <label>
            Nombre del servicio
            <input
              value={name}
              required
              minLength={3}
              maxLength={70}
              onChange={(e) => {
                setName(e.target.value);
                setRecommendation(e.target.value);
              }}
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            Fecha del último servicio
            <input
              type="date"
              value={lastDate}
              max={referenceDate}
              onChange={(e) => setLastDate(e.target.value)}
            />
          </label>
          <label>
            Kilometraje del último servicio
            <input
              type="number"
              min="0"
              max={vehicle.km}
              value={lastKm}
              onChange={(e) => setLastKm(e.target.value)}
            />
          </label>
          <label>
            Fecha de vencimiento
            <input
              type="date"
              required
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </label>
          <label>
            Kilometraje de vencimiento
            <input
              type="number"
              required
              min="1"
              max="9999999"
              value={nextKm}
              onChange={(e) => setNextKm(e.target.value)}
            />
          </label>
        </div>
        <p className="fine-print">
          Podés dejar vacíos los dos campos del último servicio si no conocés esos datos. Se admite
          un vencimiento ya pasado para corregir registros anteriores.
        </p>
        <label>
          Trabajo recomendado
          <input
            required
            maxLength={150}
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <ModalCancelButton className="button" type="button" onClick={close}>
            Cancelar
          </ModalCancelButton>
          <button className="button primary" type="submit">
            Guardar vencimiento
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function MaintenanceSchedules({ vehicle }: { vehicle: Vehicle }) {
  const { referenceDate, activeServices: services } = useData();
  const [editing, setEditing] = useState<MaintenancePlan | 'new' | null>(null);
  return (
    <Panel
      title="Vencimientos por servicio"
      icon={CalendarDays}
      action={
        <button className="button small" onClick={() => setEditing('new')}>
          <Plus size={15} />
          Agregar vencimiento
        </button>
      }
    >
      <p className="panel-description">
        Cada servicio tiene su fecha y kilometraje objetivo. Actualizar uno no reinicia los demás.
      </p>
      <div className="service-schedules">
        {vehiclePlans(vehicle).map((plan) => {
          const last = services
            .filter(
              (s) => s.vehicleId === vehicle.id && maintenanceKind(s.type).key === plan.category,
            )
            .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)[0];
          const lastDate = plan.lastDate ?? last?.date;
          const lastKm = plan.lastKm ?? last?.km;
          const remaining = plan.nextKm - vehicle.km;
          return (
            <article className="service-schedule" key={plan.category} aria-label={plan.label}>
              <div className="service-schedule-heading">
                <h3>{plan.label}</h3>
                <Badge>{planStatus(plan, vehicle.km, referenceDate)}</Badge>
              </div>
              <p>{plan.recommendation}</p>
              {plan.legacy && (
                <p className="fine-print">
                  Vencimiento del sistema anterior. Si otro trabajo lo había reiniciado, usá Editar
                  para corregirlo.
                </p>
              )}
              <p>
                <strong>
                  Vence: {dateLabel(plan.nextDate)} o {number(plan.nextKm)} km
                </strong>
              </p>
              <p className="muted">
                {lastDate && lastKm !== undefined
                  ? `Último de este servicio: ${dateLabel(lastDate)} · ${number(lastKm)} km.`
                  : 'Último servicio sin datos confirmados.'}
              </p>
              {lastKm !== undefined && (
                <p className="muted">
                  Recorridos desde este servicio: {number(vehicle.km - lastKm)} km.
                </p>
              )}
              <p className="muted">
                Kilometraje actual: {number(vehicle.km)} km ·{' '}
                {remaining > 0
                  ? `Faltan ${number(remaining)} km`
                  : `Límite alcanzado${remaining < 0 ? ` hace ${number(-remaining)} km` : ''}`}
                .
              </p>
              <div className="service-schedule-actions">
                <Link className="button small" to={planServiceURL(vehicle, plan)}>
                  <Plus size={14} />
                  Registrar {plan.label}
                </Link>
                <button
                  className="button small"
                  aria-label={`Editar vencimiento de ${plan.label}`}
                  onClick={() => setEditing(plan)}
                >
                  <Pencil size={14} />
                  Editar
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {editing && (
        <ScheduleEditor
          vehicle={vehicle}
          plan={editing === 'new' ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
    </Panel>
  );
}
