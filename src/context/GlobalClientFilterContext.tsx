import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface Ctx {
  selectedClientId: string | null;
  selectedClientName: string | null;
  setSelectedClient: (id: string | null, name: string | null) => void;
  clearSelectedClient: () => void;
}

const STORAGE_KEY = 'selected-global-client';

interface StoredValue {
  id: string | null;
  name: string | null;
}

function readStored(): StoredValue {
  if (typeof window === 'undefined') return { id: null, name: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { id: null, name: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { id: null, name: null };
    const id = typeof parsed.id === 'string' && parsed.id.length > 0 ? parsed.id : null;
    const name = typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : null;
    if (!id && !name) return { id: null, name: null };
    return { id, name };
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return { id: null, name: null };
  }
}

function writeStored(value: StoredValue | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!value || (!value.id && !value.name)) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    /* ignore quota/privacy errors */
  }
}

const GlobalClientFilterContext = createContext<Ctx>({
  selectedClientId: null,
  selectedClientName: null,
  setSelectedClient: () => {},
  clearSelectedClient: () => {},
});

export const GlobalClientFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Lazy initializer: read localStorage synchronously on first render to avoid
  // any visual flash of "no client selected" before hydration.
  const [selectedClientId, setId] = useState<string | null>(() => readStored().id);
  const [selectedClientName, setName] = useState<string | null>(() => readStored().name);

  // Cross-tab synchronization (optional but cheap): keep state aligned if the
  // same key is updated in another tab/window.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStored();
      setId(next.id);
      setName(next.name);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSelectedClient = useCallback((id: string | null, name: string | null) => {
    setId(id);
    setName(name);
    writeStored({ id, name });
  }, []);

  const clearSelectedClient = useCallback(() => {
    setId(null);
    setName(null);
    writeStored(null);
  }, []);

  return (
    <GlobalClientFilterContext.Provider value={{ selectedClientId, selectedClientName, setSelectedClient, clearSelectedClient }}>
      {children}
    </GlobalClientFilterContext.Provider>
  );
};

export function useGlobalClientFilter(): Ctx {
  return useContext(GlobalClientFilterContext);
}
