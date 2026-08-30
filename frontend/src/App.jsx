import { useEffect, useState } from 'react';
import { SessionProvider, useSession } from './context/SessionContext.jsx';
import LandingPage from './pages/LandingPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import BackendStartupPage from './pages/BackendStartupPage.jsx';
import ToastStack from './components/common/ToastStack.jsx';
import DestroyedModal from './components/common/DestroyedModal.jsx';
import { fetchHealth } from './lib/api.js';

const INITIAL_CHECK_TIMEOUT_MS = 3000;

function Shell() {
  const { screen } = useSession();

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      {screen === 'landing' ? <LandingPage /> : <WorkspacePage />}
      <ToastStack />
      <DestroyedModal />
    </>
  );
}

function BackendStartupGate() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    const checkBackend = async () => {
      try {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
          controller.abort();
        }, INITIAL_CHECK_TIMEOUT_MS);

        try {
          const health = await fetchHealth({
            signal: controller.signal,
          });

          if (cancelled) return;

          if (health?.status === 'ok') {
            setStatus('ready');
          } else {
            setStatus('starting');
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        if (!cancelled) {
          setStatus('starting');
        }
      }
    };

    checkBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'starting') {
  return <BackendStartupPage onReady={() => setStatus('ready')} />;
}

  if (status === 'ready') {
    return (
      <SessionProvider>
        <Shell />
      </SessionProvider>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      Checking service...
    </div>
  );
}

export default function App() {
  return <BackendStartupGate />;
}