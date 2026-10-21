import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { nextServiceDate } from '../lib/localDatabase';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Fuel,
  Gauge,
  Info,
  Mail,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Search,
  Settings2,
  UserRound,
  Wrench,
} from 'lucide-react';
import { Badge, Empty, Modal, PageTitle, Panel, VehicleArt } from '../components/ui';
import { useData } from '../app/store';
import { dateLabel, maintenanceStatus, money, number, type Vehicle } from '../lib/demo';

export function VehicleEditor({ vehicle, close }: { vehicle?: Vehicle; close: () => void }) {
  const { customers, vehicles, saveVehicle, notify, mode, referenceDate } = useData();
  const [error, setError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const plate = String(data.get('plate')).trim().toUpperCase().replace(/\s+/g, ' ');
    if (
      vehicles.some(
        (v) => v.id !== vehicle?.id && v.plate.replaceAll(' ', '') === plate.replaceAll(' ', ''),
      )
    ) {
      setError('Ya existe un vehículo con esta patente.');
      return;
    }
    const saved = saveVehicle({
      id: vehicle?.id ?? crypto.randomUUID(),
      customerId: String(data.get('customer')),
      plate,
      brand: String(data.get('brand')).trim(),
      model: String(data.get('model')).trim(),
      year: Number(data.get('year')),
      fuel: String(data.get('fuel')),
      engine: String(data.get('engine')).trim(),
      km: Number(data.get('km')),
      color: vehicle?.color ?? 'silver',
      nextDate: vehicle?.nextDate ?? nextServiceDate(referenceDate),
      nextKm: vehicle?.nextKm ?? Number(data.get('km')) + 10000,
      recommendation: vehicle?.recommendation ?? 'Service general',
    });
    if (!saved) return;
    notify(
      mode === 'demo'
        ? 'Vehículo guardado en la demostración. Los cambios se pierden al recargar.'
        : 'Vehículo guardado en la base local.',
    );
    close();
  };
  return (
    <Modal title={vehicle ? 'Editar vehículo' : 'Nuevo vehículo'} close={close}>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">
          {mode === 'demo'
            ? 'Datos de prueba, sin persistencia.'
            : 'Los datos quedan guardados en este navegador.'}
        </p>
        <div className="form-grid">
          <label>
            Patente <span>*</span>
            <input name="plate" required maxLength={12} defaultValue={vehicle?.plate} />
          </label>
          <label>
            Cliente propietario <span>*</span>
            <select name="customer" defaultValue={vehicle?.customerId} required>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.active ? ' (inactivo)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Marca <span>*</span>
            <input name="brand" required maxLength={50} defaultValue={vehicle?.brand} />
          </label>
          <label>
            Modelo <span>*</span>
            <input name="model" required maxLength={70} defaultValue={vehicle?.model} />
          </label>
          <label>
            Año <span>*</span>
            <input
              name="year"
              type="number"
              min="1900"
              max="2027"
              required
              defaultValue={vehicle?.year ?? 2021}
            />
          </label>
          <label>
            Kilometraje registrado <span>*</span>
            <input
              name="km"
              type="number"
              min={vehicle?.km ?? 0}
              max="9999999"
              required
              defaultValue={vehicle?.km ?? 0}
            />
          </label>
          <label>
            Motor
            <input name="engine" maxLength={60} defaultValue={vehicle?.engine} />
          </label>
          <label>
            Combustible
            <select name="fuel" defaultValue={vehicle?.fuel ?? 'Nafta'}>
              <option>Nafta</option>
              <option>Diésel</option>
              <option>GNC</option>
              <option>Híbrido</option>
              <option>Eléctrico</option>
            </select>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            Cancelar
          </button>
          <button className="button primary">
            <Check size={16} />
            {mode === 'demo' ? 'Guardar en demo' : 'Guardar vehículo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Vehicles() {
  const { vehicles, customers, referenceDate } = useData();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [adding, setAdding] = useState(false);
  const filtered = vehicles.filter(
    (v) =>
      `${v.plate} ${v.brand} ${v.model} ${customers.find((c) => c.id === v.customerId)?.name}`
        .toLocaleLowerCase('es')
        .includes(search.toLocaleLowerCase('es')) &&
      (status === 'todos' || maintenanceStatus(v, referenceDate) === status),
  );
  return (
    <>
      <PageTitle
        title="Vehículos"
        subtitle="Cada vehículo, su historia. Toda tu flota organizada."
        actions={
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Nuevo vehículo
          </button>
        }
      />
      <div className="filter-bar">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Buscar vehículos"
            placeholder="Buscar por patente, marca, modelo o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Estado de mantenimiento"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="todos">Todos los estados</option>
          <option>Al día</option>
          <option>Próximo</option>
          <option>Vencido</option>
        </select>
        <span className="results-count">{filtered.length} vehículos</span>
      </div>
      <div className="vehicle-grid">
        {filtered.map((v) => (
          <Link className="vehicle-card" key={v.id} to={`/vehiculos/${v.id}`}>
            <div className="vehicle-card-image">
              <VehicleArt color={v.color} />
              <span className="vehicle-plate">{v.plate}</span>
            </div>
            <div className="vehicle-card-content">
              <div className="vehicle-card-title">
                <div>
                  <h2>
                    {v.brand} {v.model}
                  </h2>
                  <p>
                    {v.year} · {v.engine} · {v.fuel}
                  </p>
                </div>
                <ArrowRight size={18} />
              </div>
              <div className="vehicle-card-meta">
                <span>
                  <Gauge size={16} />
                  {number(v.km)} km
                </span>
                <Badge>{maintenanceStatus(v, referenceDate)}</Badge>
              </div>
              <div className="vehicle-card-owner">
                <UserRound size={15} />
                {customers.find((c) => c.id === v.customerId)?.name}
                <span>
                  Ver ficha
                  <ChevronRight size={13} />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length && <Empty text="No encontramos vehículos" />}
      {adding && <VehicleEditor close={() => setAdding(false)} />}
    </>
  );
}
export function VehicleQR({ id }: { id: string }) {
  const { mode } = useData();
  const [image, setImage] = useState('');
  const url = import.meta.env.PROD
    ? `${window.location.href.split('#')[0]}#/publico/demo/${id}`
    : `${window.location.origin}/publico/demo/${id}`;
  useEffect(() => {
    if (mode !== 'demo') return;
    let active = true;
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: '#10203a', light: '#ffffff' },
    }).then((data) => {
      if (active) setImage(data);
    });
    return () => {
      active = false;
    };
  }, [url, mode]);
  if (mode !== 'demo')
    return (
      <Panel title="Historial por QR" icon={QrCode} className="qr-panel">
        <QrCode size={52} />
        <p>
          Los datos de este vehículo están solo en este navegador. Un QR público requerirá un
          servicio para compartir la información autorizada.
        </p>
        <Link className="button full" to="/publico/demo/v2">
          Ver ejemplo ficticio
        </Link>
      </Panel>
    );
  return (
    <Panel title="Código QR del vehículo" icon={QrCode} className="qr-panel">
      {image && (
        <img src={image} alt="QR de demostración del historial público" width={148} height={148} />
      )}
      <p>Explorá el historial público de ejemplo.</p>
      <a
        className="button full"
        href={image || undefined}
        download={`taller-calamante-qr-demo-${id}.png`}
      >
        <Download size={16} />
        Descargar QR demo
      </a>
      <small className="muted">
        Enlace de prueba del entorno actual. El acceso revocable se implementará en la etapa 5.
      </small>
    </Panel>
  );
}
export function VehicleDetail() {
  const { id } = useParams();
  const { vehicles, customers, services, referenceDate } = useData();
  const vehicle = vehicles.find((v) => v.id === id);
  const [tab, setTab] = useState('Historial de mantenimientos');
  const [editing, setEditing] = useState(false);
  if (!vehicle)
    return (
      <Empty
        text="No encontramos este vehículo"
        action={
          <Link className="button" to="/vehiculos">
            Volver a vehículos
          </Link>
        }
      />
    );
  const customer = customers.find((c) => c.id === vehicle.customerId);
  const history = services
    .filter((s) => s.vehicleId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="breadcrumb">
        <Link to="/vehiculos">
          <ArrowLeft size={16} />
          Vehículos
        </Link>
        <ChevronRight size={14} />
        <span>
          {vehicle.brand} {vehicle.model} · {vehicle.plate}
        </span>
        <button className="button" onClick={() => setEditing(true)}>
          <Pencil size={15} />
          Editar vehículo
        </button>
      </div>
      <div className="vehicle-top">
        <div className="panel vehicle-summary">
          <VehicleArt color={vehicle.color} large />
          <div>
            <span className="eyebrow">FICHA DEL VEHÍCULO</span>
            <h1>
              {vehicle.brand} {vehicle.model}
            </h1>
            <div className="vehicle-tags">
              <span>{vehicle.year}</span>
              <span>{vehicle.plate}</span>
              <Badge>{maintenanceStatus(vehicle, referenceDate)}</Badge>
            </div>
            <dl className="vehicle-specs">
              <div>
                <dt>
                  <Gauge size={17} />
                  Último kilometraje
                </dt>
                <dd>{number(vehicle.km)} km</dd>
              </div>
              <div>
                <dt>
                  <Fuel size={17} />
                  Combustible
                </dt>
                <dd>{vehicle.fuel}</dd>
              </div>
              <div>
                <dt>
                  <Settings2 size={17} />
                  Motor
                </dt>
                <dd>{vehicle.engine || 'Sin registrar'}</dd>
              </div>
              <div>
                <dt>
                  <UserRound size={17} />
                  Propietario
                </dt>
                <dd>{customer?.name}</dd>
              </div>
            </dl>
          </div>
        </div>
        <VehicleQR id={vehicle.id} />
      </div>
      <div className="vehicle-detail-grid">
        <div>
          <div className="tabs vehicle-tabs" role="tablist" aria-label="Información del vehículo">
            {[
              { title: 'Historial de mantenimientos', icon: ClipboardList },
              { title: 'Información técnica', icon: Settings2 },
              { title: 'Documentación', icon: FileText },
              { title: 'Recordatorios', icon: CalendarDays },
            ].map(({ title, icon: Icon }) => (
              <button
                role="tab"
                aria-selected={tab === title}
                className={tab === title ? 'active' : ''}
                key={title}
                onClick={() => setTab(title)}
              >
                <Icon size={16} />
                {title}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={tab}>
            {tab === 'Historial de mantenimientos' && (
              <Panel
                title="Historial de mantenimientos"
                icon={Wrench}
                action={
                  <Link className="button small" to={`/mantenimientos/nuevo?vehiculo=${id}`}>
                    <Plus size={16} />
                    Registrar mantenimiento
                  </Link>
                }
              >
                <p className="panel-description">
                  Todos los trabajos realizados, en un mismo lugar.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Kilometraje</th>
                        <th>Servicio / Trabajos</th>
                        <th>Insumos</th>
                        <th>Importe</th>
                        <th>Visibilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((s) => (
                        <tr key={s.id}>
                          <td>{dateLabel(s.date)}</td>
                          <td>{number(s.km)} km</td>
                          <td className="work-cell">
                            <strong>{s.type}</strong>
                            <small>{s.work}</small>
                          </td>
                          <td className="wrap-cell">{s.supplies}</td>
                          <td>{money(s.amount)}</td>
                          <td>
                            <span className="subtle-chip">{s.public ? 'Público' : 'Privado'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!history.length && <Empty text="Este vehículo todavía no tiene mantenimientos" />}
                <div className="info-strip">
                  <Info size={18} />
                  <span>
                    Próximo servicio: {dateLabel(vehicle.nextDate)} o {number(vehicle.nextKm)} km,
                    lo que ocurra primero.
                  </span>
                </div>
              </Panel>
            )}
            {tab === 'Información técnica' && (
              <Panel title="Información técnica" icon={Settings2}>
                <dl className="technical-list">
                  {[
                    ['Marca', vehicle.brand],
                    ['Modelo', vehicle.model],
                    ['Año', vehicle.year],
                    ['Patente', vehicle.plate],
                    ['Motor', vehicle.engine],
                    ['Combustible', vehicle.fuel],
                    ['Último kilometraje registrado', `${number(vehicle.km)} km`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || 'Sin registrar'}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}
            {tab === 'Documentación' && (
              <Panel title="Documentación del vehículo" icon={FileText}>
                <div className="empty">
                  <FileText size={36} />
                  <h3>Los documentos, en un lugar seguro</h3>
                  <p>
                    El almacenamiento de fotografías y documentos se incorporará en una próxima
                    entrega.
                  </p>
                  <button className="button" disabled>
                    Disponible en la etapa de persistencia
                  </button>
                </div>
              </Panel>
            )}
            {tab === 'Recordatorios' && (
              <Panel title="Próximo mantenimiento" icon={CalendarDays}>
                <div className="reminder-detail">
                  <Badge>{maintenanceStatus(vehicle, referenceDate)}</Badge>
                  <h3>{vehicle.recommendation}</h3>
                  <p>
                    {dateLabel(vehicle.nextDate)} o {number(vehicle.nextKm)} km
                  </p>
                  <div className="info-strip">
                    <Info size={18} />
                    Estimación basada en el último kilometraje registrado.
                  </div>
                  <Link className="button primary" to={`/mantenimientos/nuevo?vehiculo=${id}`}>
                    Registrar servicio
                  </Link>
                </div>
              </Panel>
            )}
          </div>
        </div>
        <aside className="vehicle-aside">
          <Panel title="Próximo servicio" icon={CalendarDays}>
            <div className="next-service-type">
              <Wrench size={22} />
              <span>
                <strong>{vehicle.recommendation}</strong>
                <small>Recomendación de mantenimiento</small>
              </span>
            </div>
            <div className="next-service-values">
              <div>
                <small>Fecha objetivo</small>
                <strong>{dateLabel(vehicle.nextDate)}</strong>
              </div>
              <div>
                <small>Kilometraje objetivo</small>
                <strong>{number(vehicle.nextKm)} km</strong>
              </div>
            </div>
            <Link className="button primary full" to={`/mantenimientos/nuevo?vehiculo=${id}`}>
              Registrar servicio ahora
            </Link>
            <p className="fine-print">Estimación según el último kilometraje informado.</p>
          </Panel>
          <Panel
            title="Datos del propietario"
            icon={UserRound}
            action={
              <Link className="text-link" to={`/clientes?cliente=${customer?.id}`}>
                Ver cliente
              </Link>
            }
          >
            <strong>{customer?.name}</strong>
            <div className="contact-list">
              <span>
                <Mail size={16} />
                {customer?.email || 'Sin email'}
              </span>
              <span>
                <Phone size={16} />
                {customer?.phone || 'Sin teléfono'}
              </span>
            </div>
            <span className="private-label">Información privada del taller</span>
          </Panel>
          <Panel title="Fotografías y archivos" icon={Camera}>
            <div className="attachment-placeholder">
              <Camera size={24} />
              <span>Sin archivos almacenados</span>
            </div>
            <p className="fine-print">
              Usamos ilustraciones provisionales. Las fotografías reales se incorporarán con
              almacenamiento privado.
            </p>
          </Panel>
        </aside>
      </div>
      {editing && <VehicleEditor vehicle={vehicle} close={() => setEditing(false)} />}
    </>
  );
}
