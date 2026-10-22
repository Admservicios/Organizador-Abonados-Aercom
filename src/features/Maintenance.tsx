import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { serviceSchema } from '../lib/serviceValidation';
import { nextServiceDate } from '../lib/localDatabase';
import { downloadServicePDF } from '../lib/servicePDF';
import { ServicePDFButton } from '../components/ServicePDFButton';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  CarFront,
  Clock3,
  FileDown,
  Info,
  NotebookPen,
  Plus,
  Save,
  Search,
  Settings2,
  UploadCloud,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { Badge, Empty, PageTitle, Panel, VehicleArt } from '../components/ui';
import { useData } from '../app/store';
import { dateLabel, maintenanceStatus, money, number, type Service } from '../lib/demo';

export function MaintenanceList() {
  const { services, vehicles, customers } = useData();
  const [search, setSearch] = useState('');
  const filtered = [...services]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((s) => {
      const v = vehicles.find((v) => v.id === s.vehicleId);
      return `${s.type} ${s.work} ${v?.brand} ${v?.model} ${v?.plate}`
        .toLocaleLowerCase('es')
        .includes(search.toLocaleLowerCase('es'));
    });
  return (
    <>
      <PageTitle
        title="Mantenimientos"
        subtitle="El trabajo de tu taller, registrado visita a visita."
        actions={
          <Link className="button primary" to="/mantenimientos/nuevo">
            <Plus size={17} />
            Registrar mantenimiento
          </Link>
        }
      />
      <div className="filter-bar">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Buscar mantenimientos"
            placeholder="Buscar por patente, vehículo o trabajo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="results-count">{filtered.length} registros</span>
      </div>
      <Panel title="Historial del taller" icon={Wrench}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vehículo</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Kilometraje</th>
                <th>Importe</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const v = vehicles.find((v) => v.id === s.vehicleId);
                return (
                  <tr key={s.id}>
                    <td>{dateLabel(s.date)}</td>
                    <td>
                      <Link className="table-link" to={`/vehiculos/${s.vehicleId}`}>
                        <strong>{v?.plate}</strong>
                        <small>
                          {v?.brand} {v?.model}
                        </small>
                      </Link>
                    </td>
                    <td>{customers.find((c) => c.id === v?.customerId)?.name}</td>
                    <td>
                      <span className="service-type">
                        <Wrench size={15} />
                        {s.type}
                      </span>
                    </td>
                    <td>{number(s.km)} km</td>
                    <td>{money(s.amount)}</td>
                    <td>
                      <ServicePDFButton service={s} />
                      <Link
                        className="icon-button"
                        to={`/vehiculos/${s.vehicleId}`}
                        aria-label={`Ver servicio de ${v?.plate}`}
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty text="No encontramos mantenimientos" />}
      </Panel>
    </>
  );
}
export function MaintenanceForm() {
  const { customers, vehicles, services, workshop, addService, notify, mode, referenceDate } =
    useData();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialVehicle = vehicles.find((v) => v.id === params.get('vehiculo')) ?? vehicles[0];
  const [customerId, setCustomerId] = useState(initialVehicle?.customerId ?? '');
  const [vehicleId, setVehicleId] = useState(initialVehicle?.id ?? '');
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const [serviceType, setServiceType] = useState('Service general');
  const isAlignment = serviceType === 'Alineación y balanceo';
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const photoRef = useRef(photos);
  photoRef.current = photos;
  const [nextDate, setNextDate] = useState(nextServiceDate(referenceDate));
  const [nextKm, setNextKm] = useState((initialVehicle?.km ?? 0) + 10000);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  useEffect(() => () => photoRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const changeVehicle = (id: string) => {
    setVehicleId(id);
    setNextKm((vehicles.find((v) => v.id === id)?.km ?? 0) + 10000);
    setDirty(true);
  };
  const cancel = () => {
    if (!dirty || window.confirm('Hay cambios sin guardar. ¿Querés salir del formulario?'))
      navigate('/mantenimientos');
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vehicle || saving) return;
    const wantsPDF = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'pdf';
    const data = new FormData(e.currentTarget);
    const alignment = String(data.get('alignment') ?? '');
    const balancing = String(data.get('balancing') ?? '');
    if (isAlignment && alignment === 'No realizada' && balancing === 'No realizado') {
      setError('Indicá una alineación o un balanceo realizado para guardar este servicio.');
      return;
    }
    const result = serviceSchema.safeParse({
      date: data.get('date'),
      km: Number(data.get('km')),
      type: data.get('type'),
      work: data.get('work'),
      amount: Number(data.get('amount')),
      nextDate,
      nextKm,
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    const work = isAlignment
      ? `Alineación: ${alignment}. Balanceo: ${balancing}. ${result.data.work}`
      : result.data.work;
    if (work.length > 2000) {
      setError('El detalle completo del trabajo no puede superar los 2000 caracteres.');
      return;
    }
    if (result.data.km < vehicle.km) {
      setError(`El kilometraje debe ser igual o mayor a ${number(vehicle.km)} km.`);
      return;
    }
    if (result.data.date > referenceDate) {
      setError('La fecha del servicio no puede ser posterior a la fecha actual de referencia.');
      return;
    }
    const supplies = ['oil', 'viscosity', 'oilFilter', 'airFilter', 'fuelFilter', 'other']
      .map((key) => String(data.get(key) ?? '').trim())
      .filter(Boolean)
      .join(' · ');
    const service: Service = {
      id: crypto.randomUUID(),
      vehicleId: vehicle.id,
      date: result.data.date,
      km: result.data.km,
      type: result.data.type,
      work,
      supplies: supplies || 'Sin insumos registrados',
      amount: result.data.amount,
      notes: String(data.get('notes')).trim(),
      public: data.get('public') === 'on',
    };
    const next = { date: nextDate, km: nextKm, recommendation: String(data.get('nextType')) };
    const saved = addService(service, next);
    if (!saved) return;
    setDirty(false);
    let message =
      mode === 'demo'
        ? 'Mantenimiento agregado a la sesión de demostración. Las fotos solo se previsualizaron.'
        : 'Mantenimiento guardado en la base local. Las fotos solo se previsualizaron.';
    if (wantsPDF) {
      setSaving(true);
      try {
        const customer = customers.find((c) => c.id === vehicle.customerId);
        if (!customer) throw new Error('Falta el cliente.');
        await downloadServicePDF({
          service,
          customer,
          vehicle: {
            ...vehicle,
            km: service.km,
            nextDate: next.date,
            nextKm: next.km,
            recommendation: next.recommendation,
          },
          workshop,
          demo: mode === 'demo',
        });
        message =
          mode === 'demo'
            ? 'Mantenimiento agregado a la demo y PDF descargado.'
            : 'Mantenimiento guardado en la base local y PDF descargado.';
      } catch {
        message =
          'El mantenimiento quedó guardado. No se pudo generar el PDF; podés descargarlo desde el historial sin volver a cargar el servicio.';
      } finally {
        setSaving(false);
      }
    }
    notify(message);
    navigate(`/vehiculos/${vehicle.id}`);
  };
  const history = services
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  return (
    <>
      <PageTitle
        title="Registrar mantenimiento"
        subtitle="Completá la información del servicio realizado al vehículo."
        actions={
          <button className="button" onClick={cancel} disabled={saving}>
            <ArrowLeft size={16} />
            Volver
          </button>
        }
      />
      <form className="maintenance-layout" onSubmit={submit} onChange={() => setDirty(true)}>
        <div className="form-main" inert={saving}>
          <Panel title="Cliente y vehículo" icon={CarFront}>
            <div className="form-grid">
              <label>
                Cliente <span>*</span>
                <select
                  aria-label="Cliente"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    changeVehicle(vehicles.find((v) => v.customerId === e.target.value)?.id ?? '');
                  }}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vehículo <span>*</span>
                <select
                  aria-label="Vehículo"
                  required
                  value={vehicleId}
                  onChange={(e) => changeVehicle(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccionar vehículo
                  </option>
                  {vehicles
                    .filter((v) => v.customerId === customerId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.brand} {v.model} · {v.plate}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {vehicle ? (
              <div className="selected-vehicle">
                <CarFront size={24} />
                <span>
                  <strong>{vehicle.plate}</strong>
                  <small>
                    {vehicle.brand} {vehicle.model} · {vehicle.year} · {vehicle.fuel}
                  </small>
                </span>
                <Link to={`/vehiculos/${vehicle.id}`} className="text-link">
                  Ver ficha
                  <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <p className="form-error">
                Este cliente no tiene vehículos. Registrá uno antes de cargar un mantenimiento.
              </p>
            )}
          </Panel>
          <Panel title="Detalles del mantenimiento" icon={Wrench}>
            <div className="form-grid three">
              <label>
                Fecha del servicio <span>*</span>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={referenceDate}
                  max={referenceDate}
                />
              </label>
              <label>
                Kilometraje actual <span>*</span>
                <div className="input-suffix">
                  <input
                    key={vehicleId}
                    type="number"
                    name="km"
                    required
                    min={vehicle?.km ?? 0}
                    max="9999999"
                    defaultValue={vehicle?.km ?? 0}
                  />
                  <span>km</span>
                </div>
              </label>
              <label>
                Tipo de servicio <span>*</span>
                <select
                  name="type"
                  required
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                >
                  <option>Service general</option>
                  <option>Cambio de aceite</option>
                  <option>Filtros</option>
                  <option>Frenos</option>
                  <option>Neumáticos</option>
                  <option>Alineación y balanceo</option>
                  <option>Revisión general</option>
                  <option>Otro mantenimiento</option>
                </select>
              </label>
            </div>
            <label>
              Trabajos realizados <span>*</span>
              <textarea
                name="work"
                required
                minLength={5}
                maxLength={isAlignment ? 1800 : 2000}
                rows={3}
                placeholder="Describí las tareas realizadas en este servicio…"
              />
            </label>
          </Panel>
          {isAlignment && (
            <Panel title="Alineación y balanceo" icon={Settings2}>
              <div className="form-grid">
                <label>
                  Alineación realizada <span>*</span>
                  <select name="alignment" required defaultValue="Eje delantero">
                    <option>Eje delantero</option>
                    <option>Ejes delantero y trasero</option>
                    <option>No realizada</option>
                  </select>
                </label>
                <label>
                  Ruedas balanceadas <span>*</span>
                  <select name="balancing" required defaultValue="Las 4 ruedas">
                    <option>Las 4 ruedas</option>
                    <option>2 ruedas delanteras</option>
                    <option>2 ruedas traseras</option>
                    <option>No realizado</option>
                  </select>
                </label>
              </div>
              <p className="fine-print">
                Detallá ajustes, vibraciones o desgaste de neumáticos en Trabajos realizados. Podés
                registrar ambas tareas o solo la que se realizó.
              </p>
            </Panel>
          )}
          <Panel title="Insumos y repuestos" icon={Settings2}>
            <div className="form-grid three">
              <label>
                Aceite de motor
                <input name="oil" list="oils" placeholder="Marca y producto" maxLength={100} />
                <datalist id="oils">
                  <option>Shell Helix HX8</option>
                  <option>Motul 8100</option>
                  <option>Castrol Magnatec</option>
                  <option>YPF Elaion</option>
                </datalist>
              </label>
              <label>
                Viscosidad
                <select name="viscosity">
                  <option value="">Sin especificar</option>
                  <option>0W-20</option>
                  <option>5W-30</option>
                  <option>5W-40</option>
                  <option>10W-40</option>
                  <option>15W-40</option>
                </select>
              </label>
              <label>
                Filtro de aceite
                <input name="oilFilter" placeholder="Marca / código" maxLength={100} />
              </label>
              <label>
                Filtro de aire
                <input name="airFilter" placeholder="Marca / código" maxLength={100} />
              </label>
              <label>
                Filtro de combustible
                <input name="fuelFilter" placeholder="Marca / código" maxLength={100} />
              </label>
              <label>
                Otros repuestos
                <input name="other" placeholder="Ej.: bujías, correa…" maxLength={300} />
              </label>
            </div>
          </Panel>
          <Panel title="Próximo mantenimiento" icon={CalendarDays}>
            <div className="form-grid three">
              <label>
                Fecha recomendada <span>*</span>
                <input
                  type="date"
                  required
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                />
              </label>
              <label>
                Kilometraje objetivo <span>*</span>
                <input
                  type="number"
                  required
                  min={(vehicle?.km ?? 0) + 1}
                  max="9999999"
                  value={nextKm}
                  onChange={(e) => setNextKm(Number(e.target.value))}
                />
              </label>
              <label>
                Trabajo recomendado
                <select name="nextType">
                  <option>Cambio de aceite y filtros</option>
                  <option>Service general</option>
                  <option>Revisión de frenos</option>
                  <option>Control de neumáticos</option>
                  <option>Alineación y balanceo</option>
                </select>
              </label>
            </div>
            <p className="fine-print">
              Se considerará la fecha o el kilometraje, lo que ocurra primero.
            </p>
          </Panel>
          <div className="form-bottom-grid">
            <Panel title="Observaciones privadas" icon={NotebookPen}>
              <label>
                <span className="sr-only">Observaciones privadas</span>
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={500}
                  placeholder="Información interna del taller. No se muestra en el QR."
                />
              </label>
            </Panel>
            <Panel title="Importe del servicio" icon={Wallet}>
              <label>
                Importe total (ARS) <span>*</span>
                <div className="input-suffix">
                  <input
                    type="number"
                    name="amount"
                    required
                    min="0"
                    max="999999999"
                    step="0.01"
                    placeholder="0,00"
                  />
                  <span>$</span>
                </div>
              </label>
            </Panel>
          </div>
          <Panel title="Fotos del mantenimiento" icon={Camera}>
            <label className="upload-zone">
              <UploadCloud size={28} />
              <strong>Seleccioná imágenes para previsualizar</strong>
              <span>JPG, PNG o WebP · Hasta 6 imágenes de 10 MB</span>
              <input
                type="file"
                aria-label="Seleccionar fotos"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (
                    files.length + photos.length > 6 ||
                    files.some(
                      (f) =>
                        f.size > 10 * 1024 * 1024 ||
                        !['image/jpeg', 'image/png', 'image/webp'].includes(f.type),
                    )
                  ) {
                    setError('Elegí hasta 6 imágenes JPG, PNG o WebP de 10 MB como máximo.');
                    e.target.value = '';
                    return;
                  }
                  setPhotos((p) => [
                    ...p,
                    ...files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
                  ]);
                  e.target.value = '';
                }}
              />
            </label>
            {photos.length > 0 && (
              <div className="photo-previews">
                {photos.map((p) => (
                  <div key={p.url}>
                    <img src={p.url} alt={p.name} />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Quitar ${p.name}`}
                      onClick={() => {
                        URL.revokeObjectURL(p.url);
                        setPhotos((current) => current.filter((i) => i.url !== p.url));
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="fine-print">
              Solo previsualización local: las imágenes no se suben ni se guardan en esta etapa.
            </p>
          </Panel>
        </div>
        <aside className="form-aside">
          <Panel title="Resumen del vehículo" icon={CarFront}>
            {vehicle ? (
              <>
                <VehicleArt color={vehicle.color} />
                <h3>
                  {vehicle.brand} {vehicle.model}
                </h3>
                <p className="plate-text">{vehicle.plate}</p>
                <p className="muted">
                  {vehicle.year} · {vehicle.engine} · {vehicle.fuel}
                </p>
                <strong className="vehicle-km">
                  <GaugeIcon />
                  {number(vehicle.km)} km registrados
                </strong>
              </>
            ) : (
              <p>Seleccioná un vehículo.</p>
            )}
          </Panel>
          <Panel title="Últimos mantenimientos" icon={Clock3}>
            {history.length ? (
              history.map((s) => (
                <div className="form-history-item" key={s.id}>
                  <i />
                  <span>
                    <small>{dateLabel(s.date)}</small>
                    <strong>{s.type}</strong>
                    <small>{number(s.km)} km</small>
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">Sin servicios registrados.</p>
            )}
          </Panel>
          <Panel className="save-panel">
            <div className="info-strip">
              <Info size={21} />
              <span>
                Próximo servicio
                <strong>{nextDate ? dateLabel(nextDate) : 'Elegí una fecha'}</strong>o a los{' '}
                {number(nextKm)} km
              </span>
            </div>
            <label className="check-label">
              <input type="checkbox" name="public" disabled={mode !== 'demo'} />
              {mode === 'demo'
                ? 'Mostrar este servicio en el historial público de prueba'
                : 'Historial público pendiente de implementar'}
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" type="submit" disabled={!vehicle || saving}>
              <Save size={17} />
              {mode === 'demo' ? 'Guardar en demo' : 'Guardar mantenimiento'}
            </button>
            <button
              className="button full"
              type="submit"
              name="intent"
              value="pdf"
              disabled={!vehicle || saving}
            >
              <FileDown size={17} />
              {saving ? 'Generando PDF…' : 'Guardar y generar PDF'}
            </button>
            <button className="button ghost full" type="button" onClick={cancel} disabled={saving}>
              Cancelar
            </button>
            <p className="fine-print">
              {mode === 'demo'
                ? 'Registro de demostración: dura hasta recargar.'
                : 'El registro se conserva en este navegador. Descargá respaldos periódicamente.'}
            </p>
          </Panel>
        </aside>
      </form>
    </>
  );
}
function GaugeIcon() {
  return <CarFront size={16} />;
}
export function Reminders() {
  const { vehicles, customers, referenceDate } = useData();
  const [status, setStatus] = useState('Todos');
  const [search, setSearch] = useState('');
  const filtered = vehicles
    .filter(
      (v) =>
        (status === 'Todos' || maintenanceStatus(v, referenceDate) === status) &&
        `${v.plate} ${v.brand} ${v.model} ${customers.find((c) => c.id === v.customerId)?.name}`
          .toLocaleLowerCase('es')
          .includes(search.toLocaleLowerCase('es')),
    )
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  return (
    <>
      <PageTitle
        title="Próximos servicios"
        subtitle="Anticipate a cada revisión. Que ningún mantenimiento quede atrás."
      />
      <div className="reminder-summary">
        {['Vencido', 'Próximo', 'Al día'].map((state, i) => (
          <button
            key={state}
            className={`reminder-summary-card ${['red', 'amber', 'green'][i]} ${status === state ? 'chosen' : ''}`}
            onClick={() => setStatus(status === state ? 'Todos' : state)}
          >
            <CalendarDays size={24} />
            <span>
              <strong>
                {vehicles.filter((v) => maintenanceStatus(v, referenceDate) === state).length}
              </strong>
              <small>
                {state === 'Vencido'
                  ? 'Vencidos'
                  : state === 'Próximo'
                    ? 'Próximos a vencer'
                    : 'Al día'}
              </small>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Buscar próximos servicios"
            placeholder="Buscar por patente, vehículo o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar vencimientos"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option>Todos</option>
          <option>Vencido</option>
          <option>Próximo</option>
          <option>Al día</option>
        </select>
      </div>
      <Panel title="Agenda de mantenimiento" icon={CalendarDays}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Cliente</th>
                <th>Trabajo recomendado</th>
                <th>Fecha / Kilometraje objetivo</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link className="table-link" to={`/vehiculos/${v.id}`}>
                      <strong>{v.plate}</strong>
                      <small>
                        {v.brand} {v.model}
                      </small>
                    </Link>
                  </td>
                  <td>{customers.find((c) => c.id === v.customerId)?.name}</td>
                  <td>{v.recommendation}</td>
                  <td>
                    <div className="table-link">
                      <strong>{dateLabel(v.nextDate)}</strong>
                      <small>
                        {number(v.nextKm)} km · último: {number(v.km)} km
                      </small>
                    </div>
                  </td>
                  <td>
                    <Badge>{maintenanceStatus(v, referenceDate)}</Badge>
                  </td>
                  <td>
                    <Link className="button small" to={`/mantenimientos/nuevo?vehiculo=${v.id}`}>
                      <Plus size={14} />
                      Registrar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty text="No hay servicios con estos filtros" />}
      </Panel>
      <div className="info-strip">
        <Info size={18} />
        <span>
          Fecha de referencia: {dateLabel(referenceDate)}. “Próximo” significa hasta 30 días o 1.000
          km restantes. El kilometraje es una estimación basada en el último registro.
        </span>
      </div>
    </>
  );
}
