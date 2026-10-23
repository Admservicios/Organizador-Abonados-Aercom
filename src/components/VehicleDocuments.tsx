import { isServerMode } from '../lib/serverClient';
import { useUnsavedChanges } from './UnsavedChanges';
import { useEffect, useState, type FormEvent } from 'react';
import { Download, FileText, Trash2, UploadCloud, Pencil } from 'lucide-react';
import { useData } from '../app/store';
import { Modal, ModalCancelButton } from './ui';
import { downloadBlob } from '../lib/photoBackup';
import {
  documentCategories,
  DOCUMENT_ACCEPT,
  documentMime,
  documentFileMime,
  documentExtension,
  type StoredDocument,
  loadReferencedDocuments,
  MAX_VEHICLE_DOCUMENTS,
  MAX_DOCUMENTS,
  prepareDocument,
  type DocumentReference,
} from '../lib/documents';

export function VehicleDocuments({ vehicleId }: { vehicleId: string }) {
  const {
    vehicles,
    saveDocument,
    documents,
    documentSet,
    demoDocuments,
    mode,
    addDocument,
    removeDocument,
    notify,
    storageError,
  } = useData();
  const refs = (documents ?? []).filter((d) => d.vehicleId === vehicleId);
  const [category, setCategory] = useState<DocumentReference['category']>('Cédula');
  const [file, setFile] = useState<File | null>(null);
  const { markClean } = useUnsavedChanges(file !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DocumentReference | null>(null);
  const [removing, setRemoving] = useState<DocumentReference | null>(null);
  const [preview, setPreview] = useState<StoredDocument | null>(null);
  const [previewURL, setPreviewURL] = useState('');
  useEffect(() => {
    if (!preview) {
      setPreviewURL('');
      return;
    }
    const url = URL.createObjectURL(preview.data);
    setPreviewURL(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  const [inputKey, setInputKey] = useState(0);
  const fullVehicle = refs.length >= MAX_VEHICLE_DOCUMENTS;
  const full = fullVehicle || (documents?.length ?? 0) >= MAX_DOCUMENTS;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || busy || full) return;
    setBusy(true);
    setError('');
    try {
      const document = await prepareDocument(file, vehicleId, category);
      if (await addDocument(document)) {
        markClean();
        setFile(null);
        setInputKey((key) => key + 1);
        notify(
          mode === 'demo'
            ? 'Documento agregado a la demo. Se pierde al recargar.'
            : 'Documento guardado en la base local. Incluilo en tu respaldo ZIP completo.',
        );
      } else
        setError(
          'No se pudo guardar el documento. La ficha conserva sus datos anteriores. Podés reintentar.',
        );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar el documento.');
    } finally {
      setBusy(false);
    }
  };
  const download = async (ref: DocumentReference, showPreview = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const document =
        mode === 'demo'
          ? demoDocuments.find((d) => d.id === ref.id)
          : (await loadReferencedDocuments({ documentSet, documents: [ref] }))[0];
      if (!document)
        throw new Error('El archivo no está disponible. Restaurá un respaldo ZIP completo.');
      if (showPreview) setPreview({ ...document, ...ref });
      else downloadBlob(document.data, ref.name);
    } catch {
      setError(
        'No se pudo recuperar el archivo. Reintentá o restaurá un respaldo ZIP completo con sus documentos.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="panel-description">
        Guardá la cédula, seguro, VTV / RTO o facturas de este vehículo. Los documentos son privados
        del taller y se incluyen en el respaldo ZIP completo.
      </p>
      <form className="form-stack document-upload" onSubmit={submit}>
        <label>
          Tipo de documento
          <select
            value={category}
            disabled={busy || full || !!storageError}
            onChange={(e) => setCategory(e.target.value as DocumentReference['category'])}
          >
            {documentCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Archivo PDF o imagen
          <input
            key={inputKey}
            type="file"
            accept={DOCUMENT_ACCEPT}
            required
            disabled={busy || full || !!storageError}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError('');
            }}
          />
        </label>
        <p className="fine-print">
          PDF, JPG, PNG o WebP de hasta 5 MB · Imágenes de hasta 20 megapíxeles. Hasta 20 documentos
          por vehículo y 200 en total. Se conserva el archivo original.
        </p>
        <button
          className="button primary"
          type="submit"
          disabled={!file || busy || full || !!storageError}
        >
          <UploadCloud size={16} />
          {busy ? 'Procesando…' : 'Guardar documento'}
        </button>
        {full && (
          <p role="status">
            {fullVehicle
              ? 'Alcanzaste el límite de 20 documentos de este vehículo.'
              : 'Alcanzaste el límite de 200 documentos en la base.'}
          </p>
        )}
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="vehicle-documents" aria-label="Documentos guardados">
        {refs.length ? (
          [...refs]
            .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
            .map((ref) => (
              <article className="vehicle-document" key={ref.id} aria-label={ref.name}>
                <FileText size={25} />
                <div className="vehicle-document-info">
                  <strong>{ref.name}</strong>
                  <span>
                    {ref.category} · {documentExtension(ref).toUpperCase()} ·{' '}
                    {(ref.size / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} KB
                  </span>
                  <small>
                    Agregado:{' '}
                    {new Date(ref.addedAt).toLocaleDateString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}
                  </small>
                </div>
                <div className="vehicle-document-actions">
                  {documentMime(ref) !== 'application/pdf' && (
                    <button
                      className="button small"
                      disabled={busy}
                      aria-label={`Ver documento ${ref.name}`}
                      onClick={() => download(ref, true)}
                    >
                      Ver imagen
                    </button>
                  )}
                  <button
                    className="button small"
                    disabled={busy}
                    aria-label={`Descargar documento ${ref.name}`}
                    onClick={() => download(ref)}
                  >
                    <Download size={15} />
                    Descargar
                  </button>
                  <button
                    className="button small"
                    disabled={busy || !!storageError}
                    aria-label={`Editar documento ${ref.name}`}
                    onClick={() => {
                      setError('');
                      setEditing(ref);
                    }}
                  >
                    <Pencil size={15} />
                    Editar
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy || !!storageError}
                    aria-label={`Quitar documento ${ref.name}`}
                    onClick={() => setRemoving(ref)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
        ) : (
          <div className="empty">
            <FileText size={32} />
            <p>Este vehículo todavía no tiene documentos.</p>
          </div>
        )}
      </div>
      <p className="fine-print">
        {mode === 'demo'
          ? 'Demostración en memoria: los documentos se pierden al recargar.'
          : isServerMode()
            ? 'Los archivos quedan en la PC del taller y se incluyen en sus copias completas.'
            : 'Los archivos quedan en este navegador. Usá el ZIP completo para trasladarlos o recuperarlos en otro equipo.'}
      </p>
      {preview && (
        <Modal title={`Vista previa: ${preview.name}`} close={() => setPreview(null)}>
          {previewURL && (
            <img
              src={previewURL}
              alt={preview.name}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '65vh',
                objectFit: 'contain',
                margin: '0 auto',
              }}
            />
          )}
          <p className="fine-print">
            {preview.category} · Archivo original guardado{' '}
            {isServerMode() ? 'en la PC del taller' : 'en este navegador'}.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setPreview(null)}>
              Cerrar vista previa
            </button>
            <button
              className="button primary"
              onClick={() => downloadBlob(preview.data, preview.name)}
            >
              Descargar imagen
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Editar documento" close={() => setEditing(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              const name = String(values.get('name')).trim();
              if (
                !name ||
                documentFileMime(name) !== documentMime(editing) ||
                /[\\/\u0000-\u001f]/.test(name)
              ) {
                setError(
                  `Ingresá un nombre válido conservando el formato ${documentExtension(editing).toUpperCase()} original.`,
                );
                return;
              }
              if (
                await saveDocument(editing, {
                  ...editing,
                  name,
                  category: String(values.get('category')) as DocumentReference['category'],
                  vehicleId: String(values.get('vehicle')),
                })
              ) {
                setEditing(null);
                notify('Datos del documento corregidos. Se conserva el archivo original.');
              }
            }}
          >
            <p className="fine-print">
              Podés corregir el nombre, tipo y vehículo asociado. El contenido del archivo original
              se conserva. Para reemplazarlo, cargá el archivo correcto y quitá el anterior.
            </p>
            <label>
              Nombre del archivo
              <input name="name" required maxLength={200} defaultValue={editing.name} />
            </label>
            <label>
              Tipo de documento
              <select name="category" defaultValue={editing.category}>
                {documentCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Vehículo asociado
              <select name="vehicle" defaultValue={editing.vehicleId}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {v.brand} {v.model}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <ModalCancelButton type="button" className="button" onClick={() => setEditing(null)}>
                Cancelar
              </ModalCancelButton>
              <button className="button primary">Guardar cambios del documento</button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal title="Quitar documento" close={() => setRemoving(null)}>
          <p>
            Se quitará <strong>{removing.name}</strong> de la ficha del vehículo. Los respaldos
            descargados no cambian.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setRemoving(null)}>
              Cancelar
            </button>
            <button
              className="button primary"
              onClick={async () => {
                if (await removeDocument(removing.id)) {
                  setRemoving(null);
                  notify('Documento quitado de la ficha.');
                }
              }}
            >
              Confirmar y quitar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
