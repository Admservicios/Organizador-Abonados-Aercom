import { useEffect, useState } from 'react';
import { useData } from '../app/store';
import { api } from '../lib/serverClient';
import { Panel } from './ui';
import { HardDrive } from 'lucide-react';
type System = {
  lan: boolean;
  addresses: string[];
  backupBusy: boolean;
  backupError: string;
  lastBackup: string;
};
export function ServerPanel() {
  const { connected, notify, mode } = useData();
  const [system, setSystem] = useState<System | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      setSystem(await (await api('/system')).json());
      setError('');
    } catch {
      setError('No se pudo consultar el estado de la PC.');
    }
  };
  useEffect(() => {
    if (!connected || mode !== 'local') return;
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [connected, mode]);
  if (!connected) return null;
  if (mode !== 'local')
    return (
      <Panel title="PC del taller y celulares" icon={HardDrive}>
        <p>
          Volvé a tus datos para configurar la PC y sus copias. La demostración no modifica la
          configuración real.
        </p>
      </Panel>
    );
  const action = async (path: string, body?: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      await api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      await refresh();
      notify(
        path === '/network'
          ? 'Acceso de la red actualizado.'
          : 'Copia completa solicitada en la PC.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="PC del taller y celulares" icon={HardDrive}>
      <p>
        Esta instalación guarda los registros, fotos y documentos en la PC del taller. Los
        dispositivos autorizados usan la misma base.
      </p>
      <p className="fine-print">
        La PC debe permanecer encendida. Las copias ZIP se crean en su carpeta de datos al haber
        cambios, cada 15 minutos, aunque cierres el navegador. Guardá también una copia en otro
        dispositivo.
      </p>
      <a className="button" href="/api/backup?previous=1" download>
        Descargar copia previa de la PC
      </a>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {system && (
        <>
          <p>
            Red del taller: <strong>{system.lan ? 'habilitada' : 'deshabilitada'}</strong>
          </p>
          {system.lan && (
            <>
              <p>
                Abrí una de estas direcciones desde un celular conectado al mismo Wi-Fi e ingresá la
                contraseña del taller:
              </p>
              {system.addresses
                .filter((url) => !url.includes('127.0.0.1'))
                .map((url) => (
                  <p key={url}>
                    <a className="text-link" href={url}>
                      {url}
                    </a>
                  </p>
                ))}
              <p className="fine-print">
                Windows puede solicitar acceso a la red privada. El acceso por internet y el
                historial público de clientes se configurarán en una etapa posterior.
              </p>
            </>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={() => action('/network', { enabled: !system.lan })}
          >
            {system.lan
              ? 'Deshabilitar acceso desde celulares'
              : 'Habilitar acceso desde celulares'}
          </button>
          <p>
            Última copia:{' '}
            {system.lastBackup
              ? new Date(system.lastBackup).toLocaleString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                })
              : 'Se creará al guardar los primeros cambios.'}
          </p>
          {system.backupError && (
            <p role="alert" className="form-error">
              {system.backupError}
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || system.backupBusy}
            onClick={() => action('/backup-now')}
          >
            {busy || system.backupBusy ? 'Creando copia…' : 'Crear copia en la PC ahora'}
          </button>
        </>
      )}
    </Panel>
  );
}
