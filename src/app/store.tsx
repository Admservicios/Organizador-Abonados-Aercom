import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  demoDate,
  initialCustomers,
  initialServices,
  initialVehicles,
  type Customer,
  type Service,
  type Vehicle,
} from '../lib/demo';
import {
  DATABASE_KEY,
  VIEW_MODE_KEY,
  emptyData,
  loadDatabase,
  localToday,
  newDatabase,
  persistDatabase,
  type DatabaseState,
  type LocalBackup,
  type LocalData,
  type Workshop,
} from '../lib/localDatabase';

type Store = LocalData & {
  mode: 'local' | 'demo';
  referenceDate: string;
  storageError: string | null;
  updatedAt: string;
  switchMode: () => void;
  saveCustomer: (customer: Customer) => boolean;
  saveVehicle: (vehicle: Vehicle) => boolean;
  saveWorkshop: (workshop: Workshop) => boolean;
  addService: (
    service: Service,
    next: { date: string; km: number; recommendation: string },
  ) => boolean;
  restoreBackup: (backup: LocalBackup) => boolean;
  notify: (message: string) => void;
  toast: string;
  clearToast: () => void;
};
const Context = createContext<Store | null>(null);
function readLocal(): DatabaseState {
  try {
    return loadDatabase(window.localStorage);
  } catch {
    return {
      database: newDatabase(),
      raw: null,
      error:
        'El navegador bloqueó el almacenamiento local. Habilitalo para poder guardar tus datos.',
    };
  }
}
export function DataProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState(readLocal);
  const [mode, setMode] = useState<'local' | 'demo'>(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === 'demo' ? 'demo' : 'local';
    } catch {
      return 'local';
    }
  });
  const [demo, setDemo] = useState<LocalData>(() => ({
    customers: structuredClone(initialCustomers),
    vehicles: structuredClone(initialVehicles),
    services: structuredClone(initialServices),
    workshop: {
      ...emptyData().workshop,
      name: 'Taller Central',
      phone: '11 4567-8900',
      email: 'taller@example.com',
      address: 'Av. San Martín 1234, Buenos Aires',
    },
  }));
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  const clearToast = useCallback(() => setToast(''), []);
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === DATABASE_KEY || event.key === null) {
        setLocal(readLocal());
        notify('La base local cambió en otra pestaña. Revisá los datos antes de continuar.');
      }
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [notify]);
  const data = mode === 'demo' ? demo : local.database.data;
  const commit = (next: LocalData, restore = false): boolean => {
    if (mode === 'demo') {
      setDemo(next);
      return true;
    }
    if (local.error && !restore) {
      notify(local.error);
      return false;
    }
    try {
      setLocal(
        persistDatabase(window.localStorage, local.raw, next, local.database.revision, restore),
      );
      return true;
    } catch (error) {
      const message =
        error instanceof Error && error.message.startsWith('Los datos cambiaron')
          ? error.message
          : 'No se pudo guardar. El almacenamiento está lleno, bloqueado o los datos no son válidos. La base anterior se conserva.';
      notify(message);
      return false;
    }
  };
  const saveCustomer = (customer: Customer) =>
    commit({
      ...data,
      customers: data.customers.some((c) => c.id === customer.id)
        ? data.customers.map((c) => (c.id === customer.id ? customer : c))
        : [...data.customers, customer],
    });
  const saveVehicle = (vehicle: Vehicle) =>
    commit({
      ...data,
      vehicles: data.vehicles.some((v) => v.id === vehicle.id)
        ? data.vehicles.map((v) => (v.id === vehicle.id ? vehicle : v))
        : [...data.vehicles, vehicle],
    });
  const addService = (
    service: Service,
    next: { date: string; km: number; recommendation: string },
  ) =>
    commit({
      ...data,
      services: [service, ...data.services],
      vehicles: data.vehicles.map((v) =>
        v.id === service.vehicleId
          ? {
              ...v,
              km: service.km,
              nextDate: next.date,
              nextKm: next.km,
              recommendation: next.recommendation,
            }
          : v,
      ),
    });
  const switchMode = () => {
    const next = mode === 'local' ? 'demo' : 'local';
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      /* El modo visual puede cambiar aunque el navegador bloquee su preferencia. */
    }
    setMode(next);
    setToast('');
  };
  const restoreBackup = (backup: LocalBackup) => {
    if (mode !== 'local') {
      notify('Volvé al modo local para restaurar un respaldo.');
      return false;
    }
    return commit(backup.data, true);
  };
  return (
    <Context.Provider
      value={{
        ...data,
        mode,
        referenceDate: mode === 'demo' ? demoDate : localToday(),
        storageError: mode === 'local' ? local.error : null,
        updatedAt: local.raw && !local.error ? local.database.updatedAt : '',
        switchMode,
        saveCustomer,
        saveVehicle,
        addService,
        saveWorkshop: (workshop) => commit({ ...data, workshop }),
        restoreBackup,
        notify,
        toast,
        clearToast,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useData() {
  const context = useContext(Context);
  if (!context) throw new Error('DataProvider requerido');
  return context;
}
