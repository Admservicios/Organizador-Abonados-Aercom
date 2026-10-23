import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CarFront,
  ChartNoAxesCombined,
  Clock3,
  Plus,
  QrCode,
  Users,
  Wrench,
} from 'lucide-react';
import { Badge, PageTitle, Panel, TextLink } from '../components/ui';
import { useData } from '../app/store';
import { dateLabel, maintenanceStatus, number } from '../lib/demo';
import { allPlanRows, planStatus } from '../lib/maintenancePlans';

export function Dashboard() {
  const { customers, vehicles, services, mode, referenceDate } = useData();
  const monthCount = services.filter((s) => s.date.startsWith(referenceDate.slice(0, 7))).length;
  const schedule = allPlanRows(vehicles, referenceDate);
  const upcoming = schedule.filter(
    ({ vehicle, plan }) => planStatus(plan, vehicle.km, referenceDate) !== 'Al día',
  );
  const overdueCount = upcoming.filter(
    ({ vehicle, plan }) => planStatus(plan, vehicle.km, referenceDate) === 'Vencido',
  ).length;
  const soonCount = upcoming.length - overdueCount;
  const distribution = ['Al día', 'Próximo', 'Vencido', 'Sin datos'].map((status) => ({
    status,
    count: vehicles.filter((v) => maintenanceStatus(v, referenceDate) === status).length,
  }));
  const greenEnd = (distribution[0].count / (vehicles.length || 1)) * 100;
  const yellowEnd = greenEnd + (distribution[1].count / (vehicles.length || 1)) * 100;
  const redEnd = yellowEnd + (distribution[2].count / (vehicles.length || 1)) * 100;
  const chartMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(
      Date.UTC(Number(referenceDate.slice(0, 4)), Number(referenceDate.slice(5, 7)) - 12 + i, 1),
    );
    const key = d.toISOString().slice(0, 7);
    return {
      label: d.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }),
      count: services.filter((s) => s.date.startsWith(key)).length,
    };
  });
  const max = Math.max(4, ...chartMonths.map((m) => m.count));
  const points = chartMonths
    .map((m, i) => `${42 + i * 43},${180 - (m.count / max) * 145}`)
    .join(' ');
  return (
    <>
      <PageTitle
        title="Dashboard"
        subtitle="Todo lo que pasa en tu taller, en un solo lugar."
        actions={
          <>
            <span className="date-chip">
              <CalendarDays size={16} />
              {dateLabel(referenceDate)}
            </span>
            <Link className="button primary" to="/mantenimientos/nuevo">
              <Plus size={18} />
              Nuevo mantenimiento
            </Link>
          </>
        }
      />
      <div className="stats-grid">
        {[
          {
            label: 'Total de clientes',
            value: customers.length,
            icon: Users,
            color: 'blue',
            note: `${customers.filter((c) => c.active).length} clientes activos`,
          },
          {
            label: 'Vehículos registrados',
            value: vehicles.length,
            icon: CarFront,
            color: 'green',
            note: 'En la flota del taller',
          },
          {
            label: 'Servicios del mes',
            value: monthCount,
            icon: Wrench,
            color: 'amber',
            note: new Date(`${referenceDate}T12:00:00Z`).toLocaleDateString('es-AR', {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }),
          },
          {
            label: 'Servicios por atender',
            value: upcoming.length,
            icon: CalendarDays,
            color: 'red',
            note: `${overdueCount} ${overdueCount === 1 ? 'vencido' : 'vencidos'} · ${soonCount} ${soonCount === 1 ? 'próximo' : 'próximos'}`,
          },
        ].map(({ label, value, icon: Icon, color, note }) => (
          <div className="stat-card" key={label}>
            <div className={`stat-icon ${color}`}>
              <Icon size={25} />
            </div>
            <div>
              <span className="stat-label">{label}</span>
              <strong>{number(value)}</strong>
              <small>{note}</small>
            </div>
            <ArrowUpRight className="stat-corner" size={16} />
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <div className="chart-row">
            <Panel
              title="Servicios por mes"
              icon={ChartNoAxesCombined}
              action={<span className="subtle-chip">Últimos 12 meses</span>}
            >
              <p className="panel-description">
                {mode === 'demo'
                  ? 'Mantenimientos registrados en la demostración'
                  : 'Mantenimientos registrados en este navegador'}
              </p>
              <div className="line-chart">
                <svg
                  viewBox="0 0 550 225"
                  role="img"
                  aria-label={`Servicios mensuales: ${chartMonths.map((m) => `${m.label}: ${m.count}`).join(', ')}`}
                >
                  <defs>
                    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1478ff" stopOpacity=".22" />
                      <stop offset="100%" stopColor="#1478ff" stopOpacity=".01" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <g key={i}>
                      <line
                        x1="42"
                        x2="520"
                        y1={180 - i * 36.25}
                        y2={180 - i * 36.25}
                        stroke="var(--border)"
                      />
                      <text x="24" y={184 - i * 36.25} textAnchor="end">
                        {Math.round((max / 4) * i)}
                      </text>
                    </g>
                  ))}
                  <polygon points={`42,180 ${points} 515,180`} fill="url(#chartFill)" />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#0879ff"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  {chartMonths.map((m, i) => (
                    <g key={i}>
                      <circle
                        cx={42 + i * 43}
                        cy={180 - (m.count / max) * 145}
                        r="4.5"
                        fill="#0879ff"
                        stroke="var(--surface)"
                        strokeWidth="2"
                      >
                        <title>
                          {m.label}: {m.count} servicios
                        </title>
                      </circle>
                      <text x={42 + i * 43} y="210" textAnchor="middle">
                        {m.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
              <div className="chart-caption">
                <span>
                  <i />
                  Servicios realizados
                </span>
                <span>
                  {chartMonths.reduce((total, month) => total + month.count, 0)} en el período
                </span>
              </div>
            </Panel>
            <Panel title="Estado de la flota" icon={Activity}>
              <p className="panel-description">Según fecha y kilometraje registrado</p>
              <div
                className="donut"
                style={{
                  background: `conic-gradient(#19bb86 0 ${greenEnd}%, #ffbb36 ${greenEnd}% ${yellowEnd}%, #f16372 ${yellowEnd}% ${redEnd}%, #a3afc0 ${redEnd}% 100%)`,
                }}
                role="img"
                aria-label={distribution.map((d) => `${d.status}: ${d.count}`).join(', ')}
              >
                <div>
                  <strong>{vehicles.length}</strong>
                  <span>vehículos</span>
                </div>
              </div>
              <div className="donut-legend">
                {distribution.map((d, i) => (
                  <div key={d.status}>
                    <span>
                      <i style={{ background: ['#19bb86', '#ffbb36', '#f16372', '#a3afc0'][i] }} />
                      {d.status}
                    </span>
                    <strong>
                      {Math.round((d.count / (vehicles.length || 1)) * 100)}%{' '}
                      <small>{d.count}</small>
                    </strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel
            title="Próximos servicios"
            icon={CalendarDays}
            action={<TextLink to="/proximos-servicios">Ver todos</TextLink>}
          >
            <p className="panel-description">
              Atendé primero los vehículos que necesitan una revisión.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Vehículo / Patente</th>
                    <th>Cliente</th>
                    <th>Último km</th>
                    <th>Servicio / Vencimiento</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.slice(0, 5).map(({ vehicle: v, plan }) => (
                    <tr key={`${v.id}-${plan.category}`}>
                      <td>
                        <Link className="vehicle-cell" to={`/vehiculos/${v.id}`}>
                          <span className="mini-car">
                            <CarFront size={19} />
                          </span>
                          <span>
                            <strong>{v.plate}</strong>
                            <small>
                              {v.brand} {v.model}
                            </small>
                          </span>
                        </Link>
                      </td>
                      <td>{customers.find((c) => c.id === v.customerId)?.name}</td>
                      <td>{number(v.km)} km</td>
                      <td>
                        <strong>{plan.label}</strong>
                        <small className="block muted">
                          {dateLabel(plan.nextDate)} · {number(plan.nextKm)} km
                        </small>
                      </td>
                      <td>
                        <Badge>{planStatus(plan, v.km, referenceDate)}</Badge>
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          aria-label={`Ver ${v.plate}`}
                          to={`/vehiculos/${v.id}`}
                        >
                          <ArrowRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
        <div className="dashboard-aside">
          <Panel title="Actividad reciente" icon={Clock3}>
            <div className="activity-list">
              {!services.length && (
                <p className="muted">
                  Tu actividad aparecerá cuando registres el primer mantenimiento.
                </p>
              )}
              {[...services]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 4)
                .map((s, i) => {
                  const v = vehicles.find((v) => v.id === s.vehicleId);
                  return (
                    <Link key={s.id} className="activity-item" to={`/vehiculos/${s.vehicleId}`}>
                      <span className={`activity-icon ${['green', 'blue', 'amber', 'purple'][i]}`}>
                        <Wrench size={18} />
                      </span>
                      <span>
                        <strong>{s.type}</strong>
                        <span>
                          {v?.brand} {v?.model} · {v?.plate}
                        </span>
                        <small>{dateLabel(s.date)}</small>
                      </span>
                    </Link>
                  );
                })}
            </div>
            <div className="panel-note">
              <span className="online-dot" />{' '}
              {mode === 'demo'
                ? 'Actividad ficticia para explorar la interfaz'
                : 'Actividad guardada en este navegador'}
            </div>
          </Panel>
          <div className="qr-promo">
            <span className="eyebrow">MÁS CERCA DE TUS CLIENTES</span>
            <div className="qr-promo-icon">
              <QrCode size={48} strokeWidth={1.5} />
            </div>
            <h2>
              El historial, siempre
              <br />a mano.
            </h2>
            <p>
              Cada vehículo tiene una historia. Compartila desde un QR con la información que vos
              elijas.
            </p>
            <Link className="button" to="/publico/demo-hilux">
              Explorar vista pública
              <ArrowRight size={16} />
            </Link>
            <span className="qr-promo-foot">Sin instalar aplicaciones</span>
          </div>
          <div className="tip-card">
            <Wrench size={18} />
            <p>
              <strong>Un taller más organizado.</strong>
              <br />
              Registrá cada visita y anticipá el próximo mantenimiento.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
