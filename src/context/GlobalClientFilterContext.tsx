import React, { createContext, useCallback, useContext, useState } from 'react';

interface Ctx {
  selectedClientId: string | null;
  selectedClientName: string | null;
  setSelectedClient: (id: string | null, name: string | null) => void;
  clearSelectedClient: () => void;
}

const GlobalClientFilterContext = createContext<Ctx>({
  selectedClientId: null,
  selectedClientName: null,
  setSelectedClient: () => {},
  clearSelectedClient: () => {},
});

export const GlobalClientFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedClientId, setId] = useState<string | null>(null);
  const [selectedClientName, setName] = useState<string | null>(null);

  const setSelectedClient = useCallback((id: string | null, name: string | null) => {
    setId(id);
    setName(name);
  }, []);

  const clearSelectedClient = useCallback(() => {
    setId(null);
    setName(null);
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
