import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CarFront,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Gauge,
  Info,
  Phone,
  QrCode,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Brand, Empty, VehicleArt } from '../components/ui';
import { dateLabel, number, initialVehicles, initialServices } from '../lib/demo';

export function PublicHistory() {
  const { id } = useParams();
  const vehicles = initialVehicles;
  const services = initialServices;
  const vehicle = vehicles.find((v) => v.id === (id ?? 'v2'));
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!vehicle)
    return (
      <div className="public-shell">
        <Brand />
        <Empty
          text="Este historial de prueba no está disponible"
          action={
            <Link className="button" to="/">
              Volver a MotorTrack
            </Link>
          }
        />
      </div>
    );
  const history = services
    .filter((s) => s.vehicleId === vehicle.id && s.public)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="public-page">
      <div className="public-demo-bar">
        <Info size={15} />
        Vista de demostración · Datos ficticios
        <Link to="/">
          Volver al taller
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="public-shell">
        <header className="public-header">
          <Brand compact />
          <span className="public-access">
            <QrCode size={23} />
            <span>
              <strong>Acceso por QR</strong>
              <small>Vista pública de prueba</small>
            </span>
          </span>
        </header>
        <div className="public-title">
          <span className="eyebrow">CADA VEHÍCULO TIENE UNA HISTORIA</span>
          <h1>Historial del vehículo</h1>
          <p>Información pública de mantenimientos.</p>
        </div>
        <section className="panel public-vehicle">
          <VehicleArt color={vehicle.color} />
          <div className="public-vehicle-data">
            <h2>
              {vehicle.brand} {vehicle.model}
            </h2>
            <p>
              {vehicle.engine} · {vehicle.fuel} · {vehicle.year}
            </p>
            <strong className="public-plate">
              <CarFront size={19} />
              {vehicle.plate}
            </strong>
            <span className="public-km">
              <Gauge size={19} />
              <span>
                <strong>{number(vehicle.km)} km</strong>
                <small>
                  Último kilometraje registrado
                  {history[0] && history[0].km === vehicle.km
                    ? ` · ${dateLabel(history[0].date)}`
                    : ''}
                </small>
              </span>
            </span>
          </div>
          <div className="public-next">
            <span className="stat-icon amber">
              <Wrench size={23} />
            </span>
            <small>Próximo servicio</small>
            <strong>{dateLabel(vehicle.nextDate)}</strong>
            <span>o a los {number(vehicle.nextKm)} km</span>
            <small>Lo que ocurra primero.</small>
          </div>
        </section>
        <div className="public-history-heading">
          <Clock3 size={28} />
          <div>
            <h2>Historial de mantenimientos</h2>
            <p>Registros autorizados para consulta pública.</p>
          </div>
          <span className="subtle-chip">{history.length} servicios</span>
        </div>
        <div className="timeline">
          {history.map((s, i) => (
            <article key={s.id} className="timeline-item">
              <div className="timeline-date">
                <strong>{dateLabel(s.date)}</strong>
                <span>{number(s.km)} km</span>
              </div>
              <div className={`timeline-dot ${i === history.length - 1 ? 'last' : ''}`} />
              <div className="panel timeline-card">
                <span className={`timeline-icon ${['blue', 'purple', 'amber', 'green'][i % 4]}`}>
                  <Wrench size={26} />
                </span>
                <div className="timeline-card-content">
                  <div className="timeline-card-title">
                    <h3>{s.type}</h3>
                    <span className="badge green">Completado</span>
                  </div>
                  <p className="public-work">
                    <CheckCircle2 size={16} />
                    {s.work}
                  </p>
                  {expanded === s.id && (
                    <div className="public-service-details">
                      <strong>Insumos utilizados</strong>
                      <p>{s.supplies}</p>
                    </div>
                  )}
                  <button
                    className="timeline-workshop"
                    aria-expanded={expanded === s.id}
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    <Building2 size={16} />
                    <span>Taller Central MotorTrack</span>
                    <ChevronDown size={17} className={expanded === s.id ? 'rotated' : ''} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!history.length && <Empty text="Todavía no hay servicios públicos para este vehículo" />}
        <div className="public-notice">
          <QrCode size={30} />
          <div>
            <strong>Estás viendo un historial público de prueba</strong>
            <p>
              Solo se muestran los servicios autorizados. Para más detalles, contactá al taller
              cuando la aplicación esté disponible.
            </p>
          </div>
        </div>
        <div className="panel public-contact">
          <span className="stat-icon blue">
            <Building2 size={27} />
          </span>
          <div>
            <h3>Taller Central MotorTrack</h3>
            <p>Taller de demostración</p>
          </div>
          <button className="button primary" disabled>
            <Phone size={17} />
            Contacto · Próxima etapa
          </button>
        </div>
        <footer className="public-footer">
          <ShieldCheck size={20} />
          <p>
            Los datos del propietario, las notas internas y los documentos privados no forman parte
            de esta vista.
            <br />
            El acceso público seguro y revocable se implementará en la etapa 5.
          </p>
        </footer>
      </div>
    </div>
  );
}
