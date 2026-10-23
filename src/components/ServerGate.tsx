import { useEffect, useState, useRef, type ReactNode, type FormEvent } from 'react';
import { CarFront, LockKeyhole } from 'lucide-react';
import { databaseSchema } from '../lib/localDatabase';
import { isServerMode, setServerBootstrap } from '../lib/serverClient';
export function ServerGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'setup' | 'login' | 'ready' | 'blocked'>(
    isServerMode() ? 'loading' : 'ready',
  );
  const ready = useRef(false);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isServerMode()) return;
    let active = true;
    const load = async () => {
      try {
        const config = await fetch('/api/config', {
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        });
        if (!config.ok) throw new Error('No se pudo conectar con la PC del taller.');
        const data = await config.json();
        if (!active) return;
        setLocal(data.local === true);
        if (!data.configured) {
          setState('setup');
          return;
        }
        const response = await fetch('/api/state', {
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        });
        if (!active) return;
        if (response.status === 401) {
          setState('login');
          return;
        }
        if (!response.ok) throw new Error('No se pudo abrir la base del taller.');
        setServerBootstrap(databaseSchema.parse(await response.json()));
        if (active) {
          ready.current = true;
          setState('ready');
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'No se pudo conectar.');
          setState('blocked');
        }
      }
    };
    void load();
    const blocked = (event: Event) => {
      setError(String((event as CustomEvent).detail));
      setState('blocked');
    };
    window.addEventListener('taller-server-blocked', blocked);
    return () => {
      active = false;
      window.removeEventListener('taller-server-blocked', blocked);
    };
  }, []);
  if (state === 'ready' || (state === 'blocked' && ready.current))
    return (
      <>
        <div inert={state === 'blocked'}>{children}</div>
        {state === 'blocked' && <ConnectionBlocked error={error} />}
      </>
    );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    if (state === 'setup' && password !== form.get('confirm')) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/${state === 'setup' ? 'setup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo ingresar.');
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo conectar con la PC.');
      setBusy(false);
    }
  };
  return (
    <main className="public-shell" style={{ maxWidth: 520, margin: '8vh auto', padding: 20 }}>
      <section className="panel" style={{ padding: 28 }}>
        <CarFront size={38} color="#0879ff" />
        <h1>Taller Calamante</h1>
        <p className="muted">Acceso a la PC del taller</p>
        {state === 'loading' ? (
          <p role="status">Conectando con el taller…</p>
        ) : state === 'blocked' ? (
          <>
            <p role="alert" className="form-error">
              {error}
            </p>
            <p>Al reconectar, revisá los registros antes de repetir una carga.</p>
            <button className="button primary" onClick={() => window.location.reload()}>
              Actualizar y continuar
            </button>
          </>
        ) : state === 'setup' && !local ? (
          <p>Primero configurá la contraseña en la PC del taller.</p>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <h2>{state === 'setup' ? 'Configurar acceso privado' : 'Ingresar al taller'}</h2>
            <p>
              {state === 'setup'
                ? 'Elegí una contraseña para el personal autorizado. Los datos y archivos se guardarán en esta PC.'
                : 'Ingresá con la contraseña del taller. La sesión dura 8 horas.'}
            </p>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                required
                minLength={state === 'setup' ? 12 : 1}
                maxLength={128}
                autoComplete={state === 'setup' ? 'new-password' : 'current-password'}
              />
            </label>
            {state === 'setup' && (
              <label>
                Repetir contraseña
                <input
                  name="confirm"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              <LockKeyhole size={17} />
              {busy ? 'Conectando…' : state === 'setup' ? 'Crear acceso al taller' : 'Ingresar'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function ConnectionBlocked({ error }: { error: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      role="alertdialog"
      aria-label="Conexión con la PC"
      onCancel={(event) => event.preventDefault()}
    >
      <h1>Conexión con la PC</h1>
      <p role="alert" className="form-error">
        {error}
      </p>
      <p>
        Actualizá y revisá los registros antes de repetir una carga. Se descartarán los cambios que
        no se hayan guardado.
      </p>
      <button autoFocus className="button primary" onClick={() => window.location.reload()}>
        Actualizar y continuar
      </button>
    </dialog>
  );
}
