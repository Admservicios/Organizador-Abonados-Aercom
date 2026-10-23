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
import {
  discardPhotos,
  MAX_SERVICE_PHOTOS,
  storePhotos,
  type PreparedPhoto,
  type StoredPhoto,
} from '../lib/photos';
import {
  recordServicePlan,
  servicePlan,
  withPlanSummary,
  vehiclePlans,
} from '../lib/maintenancePlans';
import { editServiceData } from '../lib/serviceEditing';
import type { DocumentReference } from '../lib/documents';
import {
  discardDocuments,
  storeDocuments,
  type PreparedDocument,
  type StoredDocument,
} from '../lib/documents';

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
    photos?: PreparedPhoto[],
  ) => Promise<boolean>;
  updateService: (
    original: Service,
    service: Service,
    photos: PreparedPhoto[],
    removedPhotoIds: string[],
  ) => Promise<boolean>;
  saveDocument: (original: DocumentReference, document: DocumentReference) => boolean;
  demoPhotos: StoredPhoto[];
  demoDocuments: StoredDocument[];
  addDocument: (document: PreparedDocument) => Promise<boolean>;
  removeDocument: (id: string) => boolean;
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
      name: 'Taller Calamante',
      phone: '11 4567-8900',
      email: 'taller@example.com',
      address: 'Av. San Martín 1234, Buenos Aires',
    },
  }));
  const [toast, setToast] = useState('');
  const [demoPhotos, setDemoPhotos] = useState<StoredPhoto[]>([]);
  const [demoDocuments, setDemoDocuments] = useState<StoredDocument[]>([]);
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
  const saveVehicle = (vehicle: Vehicle) => {
    const previous = data.vehicles.find((v) => v.id === vehicle.id);
    const minimum = Math.max(
      0,
      ...data.services.filter((s) => s.vehicleId === vehicle.id).map((s) => s.km),
      ...vehiclePlans(vehicle).map((p) => p.lastKm ?? 0),
    );
    if (vehicle.km < minimum) {
      notify(
        `No se puede bajar de ${minimum.toLocaleString('es-AR')} km: hay un mantenimiento o vencimiento con esa lectura. Corregí primero ese registro.`,
      );
      return false;
    }
    if (!previous || previous.km !== vehicle.km) vehicle = { ...vehicle, manualKm: vehicle.km };
    return commit({
      ...data,
      vehicles: data.vehicles.some((v) => v.id === vehicle.id)
        ? data.vehicles.map((v) =>
            v.id === vehicle.id
              ? withPlanSummary(vehicle, mode === 'demo' ? demoDate : localToday())
              : v,
          )
        : [...data.vehicles, vehicle],
    });
  };
  const updateService = async (
    original: Service,
    service: Service,
    photos: PreparedPhoto[],
    removedPhotoIds: string[],
  ) => {
    let nextData: LocalData;
    try {
      nextData = editServiceData(
        data,
        original,
        service,
        mode === 'demo' ? demoDate : localToday(),
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo corregir el servicio.');
      return false;
    }
    const setId = data.photoSet ?? crypto.randomUUID();
    const files = photos.map((photo) => ({ ...photo, serviceId: service.id, setId }));
    const retained = (data.photos ?? []).filter(
      (p) => p.serviceId !== service.id || !removedPhotoIds.includes(p.id),
    );
    if (
      retained.filter((p) => p.serviceId === service.id).length + files.length >
      MAX_SERVICE_PHOTOS
    ) {
      notify('Máximo 6 fotos por mantenimiento, contando las que ya estaban guardadas.');
      return false;
    }
    if (files.length || data.photos) {
      nextData.photoSet = setId;
      nextData.photos = [...retained, ...files.map(({ data: _blob, setId: _set, ...ref }) => ref)];
    }
    try {
      newDatabase(nextData);
      if (mode === 'local' && files.length) await storePhotos(files);
      if (commit(nextData)) {
        if (mode === 'demo')
          setDemoPhotos((previous) => [
            ...previous.filter((p) => !removedPhotoIds.includes(p.id)),
            ...files,
          ]);
        return true;
      }
    } catch {
      notify('No se pudo guardar la corrección con sus fotos. La base anterior se conserva.');
    }
    if (mode === 'local' && files.length)
      await discardPhotos(files.map((p) => p.id)).catch(() => {});
    return false;
  };
  const saveDocument = (original: DocumentReference, document: DocumentReference) => {
    const current = (data.documents ?? []).find((d) => d.id === original.id);
    if (JSON.stringify(current) !== JSON.stringify(original)) {
      notify('El documento cambió. Volvé a abrir Editar.');
      return false;
    }
    const saved = commit({
      ...data,
      documents: (data.documents ?? []).map((d) =>
        d.id === original.id
          ? {
              ...d,
              name: document.name,
              category: document.category,
              vehicleId: document.vehicleId,
            }
          : d,
      ),
    });
    if (saved && mode === 'demo')
      setDemoDocuments((previous) =>
        previous.map((d) =>
          d.id === original.id
            ? {
                ...d,
                name: document.name,
                category: document.category,
                vehicleId: document.vehicleId,
              }
            : d,
        ),
      );
    return saved;
  };
  const addService = async (
    service: Service,
    next: { date: string; km: number; recommendation: string },
    photos: PreparedPhoto[] = [],
  ): Promise<boolean> => {
    const nextData: LocalData = {
      ...data,
      services: [{ ...service, maintenance: servicePlan(service, next) }, ...data.services],
      vehicles: data.vehicles.map((v) =>
        v.id === service.vehicleId
          ? recordServicePlan(
              v,
              service,
              next,
              mode === 'demo' ? demoDate : localToday(),
              data.services,
            )
          : v,
      ),
    };
    if (!photos.length) return commit(nextData);
    const setId = data.photoSet ?? crypto.randomUUID();
    const files = photos.map((photo) => ({ ...photo, serviceId: service.id, setId }));
    try {
      if (photos.length > MAX_SERVICE_PHOTOS) throw new Error('Máximo 6 fotos por mantenimiento.');
      nextData.photoSet = setId;
      nextData.photos = [
        ...(data.photos ?? []),
        ...files.map(({ data: _blob, setId: _set, ...ref }) => ref),
      ];
      newDatabase(nextData);
      if (mode === 'demo') {
        const saved = commit(nextData);
        if (saved) setDemoPhotos((previous) => [...previous, ...files]);
        return saved;
      }
      await storePhotos(files);
      if (commit(nextData)) return true;
    } catch {
      notify(
        'No se pudo guardar el mantenimiento con sus fotos. Revisá el espacio disponible o elegí menos imágenes. La base anterior se conserva.',
      );
    }
    if (mode === 'local') await discardPhotos(files.map((photo) => photo.id)).catch(() => {});
    return false;
  };
  const addDocument = async (document: PreparedDocument): Promise<boolean> => {
    const setId = data.documentSet ?? crypto.randomUUID();
    const file = { ...document, setId };
    const { data: _blob, ...ref } = document;
    const next = { ...data, documentSet: setId, documents: [...(data.documents ?? []), ref] };
    try {
      newDatabase(next);
      if (mode === 'demo') {
        const saved = commit(next);
        if (saved) setDemoDocuments((previous) => [...previous, file]);
        return saved;
      }
      await storeDocuments([file]);
      if (commit(next)) return true;
    } catch {
      notify(
        'No se pudo guardar el documento. Revisá el archivo y el espacio disponible. La base anterior se conserva.',
      );
    }
    if (mode === 'local') await discardDocuments([document.id]).catch(() => {});
    return false;
  };
  const removeDocument = (id: string) => {
    const saved = commit({ ...data, documents: (data.documents ?? []).filter((d) => d.id !== id) });
    if (saved && mode === 'demo')
      setDemoDocuments((previous) => previous.filter((d) => d.id !== id));
    return saved;
  };
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
        updateService,
        saveDocument,
        demoPhotos,
        demoDocuments,
        addDocument,
        removeDocument,
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
