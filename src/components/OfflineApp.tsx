import { useState } from 'react';
import { Download, RefreshCw, WifiOff } from 'lucide-react';
import { Modal, Panel } from './ui';
import { applyAppUpdate, checkAppUpdate, installApp, useOfflineApp } from '../lib/offlineApp';

export function OfflineNotice() {
  const app = useOfflineApp();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {!app.online && (
        <div className="offline-notice" role="status">
          <WifiOff size={17} />
          <span>
            {app.status === 'ready'
              ? 'Sin conexión. Podés seguir trabajando en este dispositivo.'
              : 'Sin conexión. Evitá cerrar o recargar hasta que vuelva internet.'}
          </span>
        </div>
      )}
      {app.updateAvailable && (
        <div className="offline-notice update-notice" role="status">
          <RefreshCw size={17} />
          <span>Hay una nueva versión lista. Guardá tus cambios antes de actualizar.</span>
          <button className="button small" onClick={() => setConfirming(true)}>
            Actualizar aplicación
          </button>
        </div>
      )}
      {confirming && (
        <Modal
          title="Actualizar aplicación"
          close={() => {
            if (!app.updating) setConfirming(false);
          }}
        >
          <p>
            Se recargará Taller Calamante. Guardá primero los formularios que tengas abiertos,
            también en otras pestañas. Los datos y archivos ya guardados permanecen en este
            dispositivo.
          </p>
          <div className="modal-actions">
            <button className="button" disabled={app.updating} onClick={() => setConfirming(false)}>
              Más tarde
            </button>
            <button className="button primary" disabled={app.updating} onClick={applyAppUpdate}>
              {app.updating ? 'Actualizando…' : 'Recargar y actualizar'}
            </button>
          </div>
          {app.error && (
            <p className="form-error" role="alert">
              {app.error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
export function OfflineSettings() {
  const app = useOfflineApp();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <Panel title="Aplicación y uso sin conexión" icon={Download}>
      <div className="form-stack">
        <h3>
          {app.status === 'ready'
            ? 'Lista para usar sin conexión'
            : app.status === 'preparing'
              ? 'Preparando el uso sin conexión…'
              : app.status === 'unavailable'
                ? 'Instalación no disponible en esta vista'
                : 'Falta preparar el uso sin conexión'}
        </h3>
        <p>
          Después de abrirla con internet y completar la preparación, podés volver a abrir Taller
          Calamante sin conexión. Clientes, vehículos, mantenimientos, fotos, documentos y respaldos
          siguen funcionando en este dispositivo.
        </p>
        <p className="muted">
          {app.online ? 'El navegador detecta conexión.' : 'El navegador está sin conexión.'}{' '}
          {app.installed
            ? 'La aplicación está instalada.'
            : 'Podés usarla desde el navegador o instalarla cuando tu navegador lo permita.'}
        </p>
        {app.status === 'unavailable' && (
          <p>
            Abrí la dirección publicada de Taller Calamante con HTTPS en un navegador compatible
            para preparar la aplicación.
          </p>
        )}
        {app.canInstall && !app.installed && app.status === 'ready' && (
          <button className="button primary" onClick={installApp}>
            <Download size={17} />
            Instalar Taller Calamante
          </button>
        )}
        {!app.installed && (
          <div className="info-strip">
            <Download size={18} />
            <span>
              En Chrome o Edge, buscá «Instalar aplicación» en el menú o en la barra de direcciones.
              En iPhone o iPad: Safari → Compartir → Agregar a inicio. La opción depende del
              navegador y del dispositivo.
            </span>
          </div>
        )}
        <p className="fine-print">
          Instalá desde el navegador y perfil donde guardás tu base. La instalación no sincroniza
          datos entre equipos ni reemplaza los respaldos ZIP. La primera apertura y las
          actualizaciones necesitan internet.
        </p>
        <button
          className="button"
          disabled={checking || !app.online || app.status === 'unavailable'}
          onClick={async () => {
            setChecking(true);
            setMessage('');
            try {
              await checkAppUpdate();
              setMessage(
                'Comprobación iniciada. Si hay una versión nueva, aparecerá un aviso cuando esté lista.',
              );
            } catch {
              setMessage('No se pudo comprobar la actualización. Revisá la conexión y reintentá.');
            } finally {
              setChecking(false);
            }
          }}
        >
          <RefreshCw size={17} />
          {checking ? 'Buscando…' : 'Buscar actualizaciones'}
        </button>
        {message && <p role="status">{message}</p>}
        {app.error && (
          <p role="alert" className="form-error">
            {app.error}
          </p>
        )}
      </div>
    </Panel>
  );
}
