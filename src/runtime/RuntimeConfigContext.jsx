import React, { createContext, useContext, useMemo } from 'react';

const RuntimeConfigContext = createContext(undefined);

export function RuntimeConfigProvider({ config = null, children }) {
  const value = useMemo(() => ({ config }), [config]);
  return (
    <RuntimeConfigContext.Provider value={value}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRuntimeConfig() {
  const context = useContext(RuntimeConfigContext);
  if (context === undefined) {
    throw new Error('RuntimeConfigProvider is missing from the component tree');
  }
  return context.config;
}
