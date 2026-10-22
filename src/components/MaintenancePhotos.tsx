import { useEffect, useMemo, useState } from 'react';
import { Camera, Download, UploadCloud, X } from 'lucide-react';
import { Modal } from './ui';
import { useData } from '../app/store';
import { dateLabel, type Service } from '../lib/demo';
import { downloadBlob } from '../lib/photoBackup';
import {
  loadReferencedPhotos,
  MAX_SERVICE_PHOTOS,
  preparePhoto,
  type PhotoReference,
  type PreparedPhoto,
  type StoredPhoto,
} from '../lib/photos';

function PhotoImage({ photo }: { photo: PreparedPhoto }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const url = URL.createObjectURL(photo.data);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.data]);
  return <img src={url} alt={photo.name} loading="lazy" />;
}

export function PhotoPicker({
  photos,
  onChange,
  onBusy,
  onError,
}: {
  photos: PreparedPhoto[];
  onChange: (photos: PreparedPhoto[]) => void;
  onBusy: (busy: boolean) => void;
  onError: (error: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <label className="upload-zone">
        <UploadCloud size={28} />
        <strong>{busy ? 'Preparando fotos…' : 'Seleccioná fotos del mantenimiento'}</strong>
        <span>JPG, PNG o WebP · Hasta 6 fotos de 10 MB cada una</span>
        <input
          type="file"
          aria-label="Seleccionar fotos"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (!files.length || busy) return;
            if (files.length + photos.length > MAX_SERVICE_PHOTOS) {
              onError('Podés guardar hasta 6 fotos por mantenimiento.');
              return;
            }
            setBusy(true);
            onBusy(true);
            onError('');
            try {
              const prepared: PreparedPhoto[] = [];
              for (const file of files) prepared.push(await preparePhoto(file));
              onChange([...photos, ...prepared]);
            } catch (error) {
              onError(
                error instanceof Error ? error.message : 'No se pudieron preparar las fotos.',
              );
            } finally {
              setBusy(false);
              onBusy(false);
            }
          }}
        />
      </label>
      {photos.length > 0 && (
        <div className="photo-previews">
          {photos.map((photo) => (
            <div key={photo.id}>
              <PhotoImage photo={photo} />
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                aria-label={`Quitar ${photo.name}`}
                onClick={() => onChange(photos.filter((p) => p.id !== photo.id))}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="fine-print">
        Las imágenes se optimizan para ahorrar espacio y se guardan al guardar el mantenimiento.
        Incluilas en tus respaldos ZIP completos.
      </p>
    </>
  );
}

const NO_REFERENCES: PhotoReference[] = [];
export function PhotoGallery({ services }: { services: Service[] }) {
  const { photos: references, photoSet, demoPhotos, mode } = useData();
  const refs = references ?? NO_REFERENCES;
  const selectedRefs = useMemo(
    () => services.flatMap((service) => refs.filter((photo) => service.id === photo.serviceId)),
    [refs, services],
  );
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoredPhoto | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSelected(null);
    const load =
      mode === 'demo'
        ? Promise.resolve(demoPhotos.filter((p) => selectedRefs.some((r) => r.id === p.id)))
        : loadReferencedPhotos({ photoSet, photos: selectedRefs });
    load
      .then((photos) => {
        if (active) setPhotos(photos);
      })
      .catch(() => {
        if (active)
          setError(
            'No se pudieron recuperar las fotos. Podés reintentar o restaurar un respaldo ZIP completo.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedRefs, photoSet, mode, demoPhotos, retry]);
  if (loading) return <p role="status">Cargando fotos…</p>;
  if (error)
    return (
      <div>
        <p role="alert" className="form-error">
          {error}
        </p>
        <button className="button" onClick={() => setRetry((n) => n + 1)}>
          Reintentar fotos
        </button>
      </div>
    );
  if (!photos.length)
    return (
      <div className="empty">
        <Camera size={32} />
        <p>Este vehículo todavía no tiene fotos de mantenimiento.</p>
      </div>
    );
  return (
    <>
      <div className="maintenance-photo-grid">
        {photos.map((photo) => {
          const service = services.find((s) => s.id === photo.serviceId)!;
          return (
            <button
              className="maintenance-photo-card"
              key={photo.id}
              onClick={() => setSelected(photo)}
              aria-label={`Ver foto ${photo.name} del ${dateLabel(service.date)}`}
            >
              <PhotoImage photo={photo} />
              <strong>{service.type}</strong>
              <span>{dateLabel(service.date)}</span>
              <small>{photo.name}</small>
            </button>
          );
        })}
      </div>
      <p className="fine-print">
        Fotos locales del taller. Usá el respaldo ZIP completo para trasladarlas a otro navegador.
      </p>
      {selected && (
        <Modal title="Foto del mantenimiento" close={() => setSelected(null)}>
          <div className="maintenance-photo-viewer">
            <PhotoImage photo={selected} />
          </div>
          <p>{selected.name}</p>
          <button className="button" onClick={() => downloadBlob(selected.data, selected.name)}>
            <Download size={16} />
            Descargar foto
          </button>
        </Modal>
      )}
    </>
  );
}
