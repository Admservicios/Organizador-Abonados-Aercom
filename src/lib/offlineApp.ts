import { useSyncExternalStore } from 'react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type OfflineState = {
  status: 'preparing' | 'ready' | 'unavailable' | 'error';
  online: boolean;
  installed: boolean;
  canInstall: boolean;
  updateAvailable: boolean;
  updating: boolean;
  error: string;
};
const display = window.matchMedia('(display-mode: standalone)');
let state: OfflineState = {
  status: import.meta.env.PROD && 'serviceWorker' in navigator ? 'preparing' : 'unavailable',
  online: navigator.onLine,
  installed: display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
  canInstall: false,
  updateAvailable: false,
  updating: false,
  error: '',
};
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let installPrompt: InstallPrompt | undefined;
let applying = false;
let reloadPending = false;
let started = false;
let registerAgain: (() => Promise<void>) | undefined;
const preparations = new Map<ServiceWorker, Promise<boolean>>();
async function ensurePrepared() {
  const worker = registration?.active;
  if (!worker || worker.state !== 'activated') return;
  update({ status: 'preparing' });
  let job = preparations.get(worker);
  if (!job) {
    job = new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const finish = (ready: boolean) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(ready);
      };
      const timer = window.setTimeout(() => finish(false), 45000);
      channel.port1.onmessage = (event) => finish(event.data?.ready === true);
      try {
        worker.postMessage({ type: 'ENSURE_OFFLINE', online: navigator.onLine }, [channel.port2]);
      } catch {
        finish(false);
      }
    });
    preparations.set(worker, job);
  }
  const ready = await job;
  preparations.delete(worker);
  if (worker !== registration?.active) return;
  update({
    status: ready ? 'ready' : 'error',
    error: ready
      ? ''
      : 'Faltan recursos para usar sin conexión. Conectate a internet y buscá actualizaciones para preparar la aplicación.',
  });
}
function update(next: Partial<OfflineState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}
export function useOfflineApp() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}
export function startOfflineApp() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => update({ online: true }));
  window.addEventListener('offline', () => update({ online: false }));
  display.addEventListener('change', () => update({ installed: display.matches }));
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    update({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    update({ installed: true, canInstall: false });
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) {
    update({ status: 'unavailable' });
    return;
  }
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) reloadPending = true;
    hadController = true;
    update({
      status: 'ready',
      updateAvailable: !!registration?.waiting || reloadPending,
      updating: false,
    });
    if (applying) {
      applying = false;
      window.location.reload();
    } else void ensurePrepared();
  });
  const refresh = () => {
    update({ updateAvailable: !!registration?.waiting || reloadPending });
  };
  const watch = () => {
    const worker = registration?.installing;
    let activated = worker?.state === 'activated';
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'activated') activated = true;
      refresh();
      if (worker.state === 'activated') void ensurePrepared();
      if (worker.state === 'redundant' && !activated)
        update({
          status: state.status === 'ready' ? 'ready' : 'error',
          error:
            'No se pudo preparar la aplicación. Reconectate a internet y volvé a buscar actualizaciones.',
        });
    });
  };
  const base = new URL('./', window.location.href);
  registerAgain = async () => {
    const reg = await navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.pathname,
      updateViaCache: 'none',
    });
    registration = reg;
    reg.addEventListener('updatefound', watch);
    watch();
    refresh();
    await ensurePrepared();
  };
  void registerAgain().catch(() =>
    update({
      status: 'error',
      error:
        'No se pudo preparar el uso sin conexión. Abrí la aplicación con internet y reintentá.',
    }),
  );
}
export async function installApp() {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = undefined;
  update({ canInstall: false });
  try {
    await prompt.prompt();
    // Solo appinstalled o el modo standalone confirman que la instalación terminó.
    await prompt.userChoice;
  } catch {
    update({ error: 'No se pudo abrir la instalación. Usá el menú de tu navegador.' });
  }
}
export async function checkAppUpdate() {
  if (!navigator.onLine) throw new Error('Conectate a internet para buscar actualizaciones.');
  if (!registration?.active) {
    update({ status: 'preparing', error: '' });
    await registerAgain?.();
    return;
  }
  update({ error: '' });
  await registration.update();
  await ensurePrepared();
}
export function applyAppUpdate() {
  if (reloadPending) {
    window.location.reload();
    return;
  }
  const worker = registration?.waiting;
  if (!worker || applying) return;
  applying = true;
  update({ updating: true, error: '' });
  worker.postMessage({ type: 'APPLY_UPDATE' });
  window.setTimeout(() => {
    if (!applying) return;
    applying = false;
    update({
      updating: false,
      error: 'No se pudo aplicar la actualización. Guardá tus cambios y volvé a intentar.',
    });
  }, 15000);
}
