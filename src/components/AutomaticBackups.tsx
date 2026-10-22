import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FolderArchive, FolderOpen, Pause, Play, Save, Unplug } from 'lucide-react';
import { Panel } from './ui';
import { useData } from '../app/store';
import {
  BACKUP_FOLDER_LOCK,
  backupToFolder,
  folderBackupsSupported,
  pickBackupFolder,
  readBackupFolder,
  saveBackupFolder,
  type BackupFolderSettings,
} from '../lib/backupFolder';

type Status = 'idle' | 'writing' | 'permission' | 'error';
type Automation = {
  settings: BackupFolderSettings | null;
  supported: boolean;
  loaded: boolean;
  busy: boolean;
  status: Status;
  error: string;
  connect: () => Promise<void>;
  authorize: () => Promise<void>;
  configure: (
    change: Partial<Pick<BackupFolderSettings, 'enabled' | 'intervalMinutes'>>,
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  copyNow: () => Promise<void>;
};
const Context = createContext<Automation | null>(null);
export function AutomaticBackupsProvider({ children }: { children: ReactNode }) {
  const { mode, updatedAt, storageError } = useData();
  const location = useLocation();
  const supported = folderBackupsSupported();
  const [settings, setSettings] = useState<BackupFolderSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const local = useRef(false);
  local.current = mode === 'local' && !storageError && !location.pathname.startsWith('/publico/');
  const running = useRef(false);
  const blocked = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSettings(await readBackupFolder());
      if (!running.current) {
        blocked.current = false;
        setStatus('idle');
        setError('');
      }
      setLoaded(true);
    } catch {
      setError('No se pudo leer la configuración de respaldos. Podés volver a elegir una carpeta.');
      setStatus('error');
      setLoaded(true);
      blocked.current = true;
    }
  }, []);
  useEffect(() => {
    if (!supported || mode !== 'local') return;
    void refresh();
    if (!('BroadcastChannel' in window)) return;
    const current = new BroadcastChannel(BACKUP_FOLDER_LOCK);
    channel.current = current;
    current.onmessage = () => {
      void refresh();
    };
    return () => {
      current.close();
      channel.current = null;
    };
  }, [supported, mode, refresh]);
  const changed = useCallback((value: BackupFolderSettings | null) => {
    setSettings(value);
    setLoaded(true);
    setError('');
    setStatus('idle');
    blocked.current = false;
    channel.current?.postMessage('changed');
  }, []);
  const fail = (reason: unknown) => {
    blocked.current = true;
    setStatus('error');
    if (reason instanceof DOMException) {
      setError(
        reason.name === 'QuotaExceededError'
          ? 'No hay espacio para guardar el respaldo. Revisá el espacio de la carpeta y reintentá.'
          : reason.name === 'NotFoundError'
            ? 'No se encontró la carpeta de respaldo. Elegí una carpeta disponible.'
            : 'No se pudo escribir en la carpeta. Volvé a autorizarla o elegí otra carpeta.',
      );
      return;
    }
    setError(
      reason instanceof Error
        ? reason.message
        : 'No se pudo guardar la copia. Revisá la carpeta, los permisos y el espacio disponible.',
    );
  };
  const run = useCallback(
    async (force = false) => {
      if (!supported || !local.current || running.current || (!force && blocked.current)) return;
      running.current = true;
      setBusy(true);
      try {
        await navigator.locks.request(BACKUP_FOLDER_LOCK, { ifAvailable: !force }, async (lock) => {
          if (!lock || !local.current) return;
          const current = await readBackupFolder();
          if (!current?.enabled) {
            setSettings(current);
            return;
          }
          setStatus('writing');
          const result = await backupToFolder(current, window.localStorage, {
            force,
            canRun: () => local.current,
          });
          if (result.status === 'saved') {
            // El archivo ya está verificado. Un fallo de metadatos no lo borra.
            try {
              await saveBackupFolder(result.settings);
            } catch {
              setSettings(result.settings);
              throw new Error(
                `Se creó ${result.settings.lastName}, pero no se pudo registrar el resultado. La copia queda en la carpeta; revisá el almacenamiento antes de reintentar.`,
              );
            }
            changed(result.settings);
          } else if (result.status === 'permission') {
            setStatus('permission');
            blocked.current = true;
          } else setStatus('idle');
        });
      } catch (reason) {
        fail(reason);
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [supported, changed],
  );
  useEffect(() => {
    if (!supported || !loaded || mode !== 'local') return;
    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 60000);
    const focus = () => {
      if (document.visibilityState === 'visible') void run();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [
    supported,
    loaded,
    mode,
    updatedAt,
    settings?.enabled,
    settings?.intervalMinutes,
    location.pathname,
    run,
  ]);
  const mutate = async (
    change: (current: BackupFolderSettings | null) => BackupFolderSettings | null,
  ) => {
    if (!local.current || !supported || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await navigator.locks.request(BACKUP_FOLDER_LOCK, async () => {
        if (!local.current) return;
        const next = change(await readBackupFolder().catch(() => null));
        await saveBackupFolder(next);
        changed(next);
      });
    } catch (reason) {
      fail(reason);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const connect = async () => {
    if (!local.current || busy || !supported) return;
    try {
      const directory = await pickBackupFolder();
      await mutate((current) => ({
        directory,
        enabled: true,
        intervalMinutes: current?.intervalMinutes ?? 1440,
      }));
      // La primera copia se crea inmediatamente después de elegir la carpeta.
      await run();
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) fail(reason);
    }
  };
  const authorize = async () => {
    if (!local.current || !settings || busy) return;
    try {
      const permission = await settings.directory.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        setStatus('permission');
        return;
      }
      blocked.current = false;
      setError('');
      await run();
    } catch (reason) {
      fail(reason);
    }
  };
  return (
    <Context.Provider
      value={{
        settings,
        supported,
        loaded,
        busy,
        status,
        error,
        connect,
        authorize,
        configure: async (change) => {
          await mutate((current) => (current ? { ...current, ...change } : null));
          await run();
        },
        disconnect: () => mutate(() => null),
        copyNow: async () => {
          blocked.current = false;
          setError('');
          await run(true);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAutomaticBackups() {
  const value = useContext(Context);
  if (!value) throw new Error('AutomaticBackupsProvider requerido');
  return value;
}
export function AutomaticBackupNotice() {
  const { mode } = useData();
  const auto = useAutomaticBackups();
  if (
    mode !== 'local' ||
    !auto.settings?.enabled ||
    (auto.status !== 'error' && auto.status !== 'permission')
  )
    return null;
  return (
    <div className="offline-notice" role="status">
      <FolderArchive size={17} />
      <span>El respaldo automático necesita atención. Tus registros siguen en este navegador.</span>
      <Link className="button small" to="/backups">
        Revisar respaldos
      </Link>
    </div>
  );
}
export function AutomaticBackupPanel() {
  const { mode, storageError } = useData();
  const auto = useAutomaticBackups();
  const settings = auto.settings;
  return (
    <Panel title="Respaldo automático en carpeta" icon={FolderArchive}>
      <div className="form-stack">
        {mode === 'demo' ? (
          <p>
            Volvé a tus datos para configurar copias de la base local. La demostración no guarda
            archivos en tu carpeta.
          </p>
        ) : (
          <>
            <p>
              Elegí una carpeta de tu equipo para guardar ZIP completos con registros, fotos y
              documentos. Cada copia tiene un nombre nuevo; las anteriores se conservan.
            </p>
            <p className="fine-print">
              Se comprueban los cambios una vez por minuto mientras la aplicación está abierta y al
              volver a ella. El intervalo limita la frecuencia de las copias. No se ejecuta con la
              aplicación cerrada. Elegí otra unidad si necesitás protegerte también de una pérdida
              del dispositivo.
            </p>
            {!auto.supported ? (
              <div className="info-strip">
                <FolderOpen size={18} />
                <span>
                  Este navegador no permite elegir una carpeta para copias automáticas. Usá
                  Descargar ZIP completo. Esta función requiere un navegador de escritorio
                  compatible, como Chrome o Edge.
                </span>
              </div>
            ) : (
              <>
                {settings ? (
                  <>
                    <p>
                      <strong>Carpeta:</strong> {settings.directory.name}
                    </p>
                    <p>
                      <strong>Estado:</strong>{' '}
                      {auto.status === 'writing'
                        ? 'Preparando y verificando copia…'
                        : !settings.enabled
                          ? 'Pausado'
                          : auto.status === 'permission'
                            ? 'Requiere autorización de la carpeta'
                            : auto.status === 'error'
                              ? 'Requiere atención'
                              : 'Activado'}
                    </p>
                    <label>
                      Intervalo entre copias
                      <select
                        aria-label="Intervalo entre copias"
                        value={settings.intervalMinutes}
                        disabled={auto.busy || !!storageError}
                        onChange={(event) => {
                          void auto.configure({
                            intervalMinutes: Number(event.target.value) as 15 | 60 | 1440,
                          });
                        }}
                      >
                        <option value={1440}>Diario</option>
                        <option value={60}>Cada hora</option>
                        <option value={15}>Cada 15 minutos</option>
                      </select>
                    </label>
                    <p className="muted">
                      {settings.lastSuccess
                        ? `Última copia verificada: ${new Date(settings.lastSuccess).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`
                        : 'Todavía no se completó una copia en esta carpeta.'}
                    </p>
                    {settings.lastName && (
                      <p className="backup-folder-file">
                        {settings.lastName} ·{' '}
                        {((settings.lastSize ?? 0) / 1024).toLocaleString('es-AR', {
                          maximumFractionDigits: 1,
                        })}{' '}
                        KB
                      </p>
                    )}
                    <div className="recovery-buttons">
                      <button
                        className="button primary"
                        disabled={auto.busy || !settings.enabled || !!storageError}
                        onClick={() => {
                          void auto.copyNow();
                        }}
                      >
                        <Save size={16} />
                        {auto.busy ? 'Procesando…' : 'Crear copia ahora'}
                      </button>
                      <button
                        className="button"
                        disabled={auto.busy || !!storageError}
                        onClick={() => {
                          void auto.configure({ enabled: !settings.enabled });
                        }}
                      >
                        {settings.enabled ? <Pause size={16} /> : <Play size={16} />}
                        {settings.enabled ? 'Pausar copias' : 'Activar copias'}
                      </button>
                      <button
                        className="button"
                        disabled={auto.busy}
                        onClick={() => {
                          void auto.disconnect();
                        }}
                      >
                        <Unplug size={16} />
                        Desvincular carpeta
                      </button>
                    </div>
                    {(auto.status === 'permission' || auto.status === 'error') && (
                      <button
                        className="button"
                        disabled={auto.busy || !!storageError}
                        onClick={() => {
                          void auto.authorize();
                        }}
                      >
                        Autorizar carpeta
                      </button>
                    )}
                  </>
                ) : (
                  <p>No hay una carpeta configurada. La primera copia se crea al elegirla.</p>
                )}
                <button
                  className="button"
                  disabled={auto.busy || !!storageError}
                  onClick={() => {
                    void auto.connect();
                  }}
                >
                  <FolderOpen size={16} />
                  {settings ? 'Cambiar carpeta de respaldo' : 'Elegir carpeta de respaldo'}
                </button>
              </>
            )}
            {auto.error && (
              <p className="form-error" role="alert">
                {auto.error}
              </p>
            )}
            <p className="fine-print">
              Para recuperar una copia, elegí su ZIP en Restaurar un respaldo. Si el navegador
              vuelve a pedir acceso, usá Autorizar carpeta. Pausar o desvincular no borra archivos.
              La carpeta y sus permisos no se incluyen en el ZIP ni se trasladan a otro navegador.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
