import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Avatar, Badge, Empty, Modal, PageTitle, Panel } from '../components/ui';
import { useData } from '../app/store';
import { customerCSV, dateLabel, download, money, type Customer } from '../lib/demo';

export function CustomerEditor({ customer, close }: { customer?: Customer; close: () => void }) {
  const { saveCustomer, notify, mode } = useData();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name')).trim();
    if (!name) return;
    const saved = saveCustomer({
      id: customer?.id ?? crypto.randomUUID(),
      name,
      document: String(data.get('document')).trim(),
      email: String(data.get('email')).trim(),
      phone: String(data.get('phone')).trim(),
      address: String(data.get('address')).trim(),
      notes: String(data.get('notes')).trim(),
      active: data.get('active') === 'on',
    });
    if (!saved) return;
    notify(
      `${customer ? 'Cliente actualizado' : 'Cliente creado'}${mode === 'demo' ? ' en la demostración.' : ' en la base local.'}`,
    );
    close();
  };
  return (
    <Modal title={customer ? 'Editar cliente' : 'Nuevo cliente'} close={close}>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">
          {mode === 'demo'
            ? 'Registro de prueba: los cambios se pierden al recargar.'
            : 'Los cambios se guardan en este navegador.'}
        </p>
        <div className="form-grid">
          <label>
            Nombre y apellido <span>*</span>
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={customer?.name}
              autoComplete="name"
            />
          </label>
          <label>
            DNI / CUIT
            <input name="document" maxLength={25} defaultValue={customer?.document} />
          </label>
          <label>
            Teléfono
            <input
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={customer?.phone}
              autoComplete="tel"
            />
          </label>
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              maxLength={150}
              defaultValue={customer?.email}
              autoComplete="email"
            />
          </label>
        </div>
        <label>
          Dirección
          <input name="address" maxLength={200} defaultValue={customer?.address} />
        </label>
        <label>
          Observaciones
          <textarea name="notes" rows={3} maxLength={500} defaultValue={customer?.notes} />
        </label>
        <label className="check-label">
          <input name="active" type="checkbox" defaultChecked={customer?.active ?? true} />
          Cliente activo
        </label>
        <div className="modal-actions">
          <button className="button" type="button" onClick={close}>
            Cancelar
          </button>
          <button className="button primary" type="submit">
            <Check size={16} />
            {mode === 'demo' ? 'Guardar en demo' : 'Guardar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Customers() {
  const { customers, vehicles, services, mode } = useData();
  const [params, setParams] = useSearchParams();
  const selected = customers.find((c) => c.id === (params.get('cliente') ?? customers[0]?.id));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('todos');
  const [tab, setTab] = useState('Información');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const filtered = customers.filter(
    (c) =>
      `${c.name} ${c.document} ${c.phone} ${c.email}`
        .toLocaleLowerCase('es')
        .includes(search.toLocaleLowerCase('es')) &&
      (status === 'todos' || c.active === (status === 'activos')),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const selectedVehicles = vehicles.filter((v) => v.customerId === selected?.id);
  const selectedServices = services
    .filter((s) => selectedVehicles.some((v) => v.id === s.vehicleId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const exportCSV = () =>
    download(
      mode === 'demo' ? 'taller-calamante-clientes-demo.csv' : 'taller-calamante-clientes.csv',
      customerCSV(filtered),
      'text/csv;charset=utf-8',
    );
  return (
    <>
      <PageTitle
        title="Clientes"
        subtitle="Conocé a tus clientes. Acompañá cada kilómetro."
        actions={
          <>
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={18} />
              Nuevo cliente
            </button>
            <button className="button" onClick={exportCSV}>
              <Download size={17} />
              Exportar CSV
            </button>
          </>
        }
      />
      <div className={`customers-layout ${selected ? '' : 'detail-hidden'}`}>
        <div className="customers-main">
          <Panel title="Tu comunidad de clientes" icon={Users}>
            <div className="customer-stats">
              {[
                {
                  label: 'Clientes activos',
                  value: customers.filter((c) => c.active).length,
                  color: 'blue',
                  icon: Users,
                },
                {
                  label: 'Con vehículos',
                  value: customers.filter((c) => vehicles.some((v) => v.customerId === c.id))
                    .length,
                  color: 'green',
                  icon: CarFront,
                },
                {
                  label: 'Clientes inactivos',
                  value: customers.filter((c) => !c.active).length,
                  color: 'red',
                  icon: UserRound,
                },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label}>
                  <span className={`stat-icon ${color}`}>
                    <Icon size={22} />
                  </span>
                  <span>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="filter-bar">
            <div className="input-icon">
              <Search size={17} />
              <input
                aria-label="Buscar clientes"
                placeholder="Buscar por nombre, DNI, teléfono o email…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              aria-label="Filtrar clientes por estado"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="todos">Todos los estados</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
            <button
              className="text-button"
              onClick={() => {
                setSearch('');
                setStatus('todos');
                setPage(1);
              }}
            >
              <SlidersHorizontal size={15} />
              Limpiar
            </button>
          </div>
          <div className="panel table-panel">
            <div className="table-scroll">
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th>Vehículos</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Editar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((c) => (
                    <tr key={c.id} className={selected?.id === c.id ? 'selected-row' : ''}>
                      <td>
                        <button
                          className="customer-name"
                          onClick={() => {
                            setParams({ cliente: c.id });
                            setTab('Información');
                          }}
                        >
                          <Avatar name={c.name} />
                          <span>
                            <strong>{c.name}</strong>
                            <small>
                              {c.document ? `DNI ${c.document}` : 'Sin documento registrado'}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <div className="contact-cell">
                          <span>
                            <Phone size={13} />
                            {c.phone || 'Sin teléfono'}
                          </span>
                          <span>
                            <Mail size={13} />
                            {c.email || 'Sin email'}
                          </span>
                        </div>
                      </td>
                      <td>{vehicles.filter((v) => v.customerId === c.id).length}</td>
                      <td>
                        <Badge>{c.active ? 'Activo' : 'Inactivo'}</Badge>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Editar ${c.name}`}
                          onClick={() => setEditing(c)}
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && <Empty text="No encontramos clientes" />}
          </div>
          <div className="pagination">
            <span>
              {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–
              {Math.min(currentPage * pageSize, filtered.length)} de {filtered.length} clientes
            </span>
            <div>
              <button
                className="page-button"
                disabled={currentPage === 1}
                aria-label="Página anterior"
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  className={`page-button ${currentPage === i + 1 ? 'active' : ''}`}
                  aria-current={currentPage === i + 1 ? 'page' : undefined}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                className="page-button"
                disabled={currentPage === pageCount}
                aria-label="Página siguiente"
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <span>{pageSize} por página</span>
          </div>
        </div>
        {selected && (
          <aside className="panel customer-detail">
            <button
              className="detail-close icon-button"
              aria-label="Cerrar ficha del cliente"
              onClick={() => setParams({ cliente: 'ninguno' })}
            >
              <X size={17} />
            </button>
            <div className="customer-profile">
              <Avatar name={selected.name} size="large" />
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.document ? `DNI ${selected.document}` : 'Sin documento registrado'}</p>
                <Badge>{selected.active ? 'Activo' : 'Inactivo'}</Badge>
              </div>
            </div>
            <div className="tabs" role="tablist" aria-label="Ficha del cliente">
              {['Información', 'Vehículos', 'Historial', 'Notas'].map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? 'active' : ''}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="detail-content" role="tabpanel" aria-label={tab}>
              {tab === 'Información' && (
                <>
                  <Panel
                    title="Información de contacto"
                    icon={UserRound}
                    action={
                      <button className="text-button" onClick={() => setEditing(selected)}>
                        <Pencil size={13} />
                        Editar
                      </button>
                    }
                  >
                    <div className="contact-list">
                      <span>
                        <Phone size={17} />
                        {selected.phone || 'Sin teléfono'}
                      </span>
                      <span>
                        <Mail size={17} />
                        {selected.email || 'Sin email'}
                      </span>
                      <span>
                        <MapPin size={17} />
                        {selected.address || 'Sin dirección'}
                      </span>
                    </div>
                  </Panel>
                  <Panel title="Vehículos del cliente" icon={CarFront}>
                    {selectedVehicles.length ? (
                      selectedVehicles.map((v) => (
                        <Link className="vehicle-list-item" key={v.id} to={`/vehiculos/${v.id}`}>
                          <span className="mini-car">
                            <CarFront size={28} />
                          </span>
                          <span>
                            <strong>
                              {v.brand} {v.model}
                            </strong>
                            <small>
                              {v.plate} · {v.year}
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </Link>
                      ))
                    ) : (
                      <p className="muted">Todavía no tiene vehículos asociados.</p>
                    )}
                  </Panel>
                  <button className="button full" onClick={() => setTab('Historial')}>
                    <CalendarDays size={16} />
                    Ver historial del cliente
                  </button>
                </>
              )}
              {tab === 'Vehículos' &&
                (selectedVehicles.length ? (
                  selectedVehicles.map((v) => (
                    <Link key={v.id} className="vehicle-list-item" to={`/vehiculos/${v.id}`}>
                      <CarFront size={25} />
                      <span>
                        <strong>
                          {v.brand} {v.model}
                        </strong>
                        <small>
                          {v.plate} · {v.year}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </Link>
                  ))
                ) : (
                  <Empty text="Sin vehículos asociados" />
                ))}
              {tab === 'Historial' &&
                (selectedServices.length ? (
                  selectedServices.map((s) => (
                    <div key={s.id}>
                      <Link className="history-mini" to={`/vehiculos/${s.vehicleId}`}>
                        <CalendarDays size={18} />
                        <span>
                          <strong>{s.type}</strong>
                          <small>
                            {dateLabel(s.date)} · {money(s.amount)}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </Link>
                      <Link className="button small" to={`/mantenimientos/${s.id}/editar`}>
                        <Pencil size={14} />
                        Editar mantenimiento
                      </Link>
                    </div>
                  ))
                ) : (
                  <Empty text="Sin mantenimientos registrados" />
                ))}
              {tab === 'Notas' && (
                <div className="notes-block">
                  <h3>Observaciones privadas</h3>
                  <p>{selected.notes || 'Este cliente no tiene observaciones.'}</p>
                  <button className="button" onClick={() => setEditing(selected)}>
                    <Pencil size={15} />
                    Editar notas
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      {editing && (
        <CustomerEditor
          customer={editing === 'new' ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
    </>
  );
}
