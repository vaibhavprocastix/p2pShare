/**
 * SessionContext.jsx
 * ------------------------------------------------------------------
 * Wraps useP2PShare() in a Context so pages/components can consume
 * session state and actions without prop-drilling. App.jsx mounts the
 * provider once, at the root.
 * ------------------------------------------------------------------
 */
import { createContext, useContext } from 'react';
import { useP2PShare } from '../hooks/useP2PShare.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const session = useP2PShare();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession() must be used within a <SessionProvider>');
  return ctx;
}

export default SessionContext;
