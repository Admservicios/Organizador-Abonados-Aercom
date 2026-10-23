import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useBlocker } from 'react-router-dom';

const message = 'Hay cambios sin guardar. ¿Querés descartarlos y salir?';
const Changes = createContext<Map<symbol, boolean> | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<symbol, boolean>()).current;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      [...entries.values()].some(Boolean) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    // La recuperación de conexión ya anuncia el descarte antes de recargar.
    const discard = () => entries.clear();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (![...entries.values()].some(Boolean)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('taller-discard-unsaved', discard);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('taller-discard-unsaved', discard);
    };
  }, [entries]);
  return <Changes.Provider value={entries}>{children}</Changes.Provider>;
}

export function useConfirmDiscard() {
  const entries = useContext(Changes);
  return () => {
    if (!entries) throw new Error('Falta el control de cambios sin guardar.');
    if ([...entries.values()].some(Boolean) && !window.confirm(message)) return false;
    entries.clear();
    return true;
  };
}

export function useUnsavedChanges(dirty: boolean) {
  const entries = useContext(Changes);
  if (!entries) throw new Error('Falta el control de cambios sin guardar.');
  const key = useRef(Symbol('form')).current;
  useLayoutEffect(() => {
    entries.set(key, dirty);
    return () => {
      entries.delete(key);
    };
  }, [entries, key, dirty]);
  const markClean = () => {
    entries.delete(key);
  };
  const confirmDiscard = () => {
    if (dirty && !window.confirm(message)) return false;
    markClean();
    return true;
  };
  return { markClean, confirmDiscard };
}
