import { useEffect, useState } from 'react';
import { fetchHealth } from '../lib/api.js';
import '../styles/startup.css';

const CHECK_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 75000;

export default function BackendStartupPage() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;
    let elapsedTimer = null;

    const checkBackend = async () => {
      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const response = await fetchHealth({
          signal: controller.signal,
        });

        if (!cancelled && response?.status === 'ok') {
          window.location.reload();
          return;
        }
      } catch {
        // Backend is probably waking up or temporarily unavailable.
      } finally {
        clearTimeout(timeout);
      }

      if (!cancelled) {
        retryTimer = setTimeout(checkBackend, CHECK_INTERVAL_MS);
      }
    };

    elapsedTimer = setInterval(() => {
      if (!cancelled) {
        setElapsedSeconds((seconds) => seconds + 1);
      }
    }, 1000);

    checkBackend();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(elapsedTimer);
    };
  }, []);

  return (
    <main className="startup-page">
      <section className="startup-card" aria-live="polite">
        <div className="startup-spinner" aria-hidden="true" />

        <h1>Starting the service</h1>

        <p className="startup-primary">
          This app is hosted on a free-tier server.
        </p>

        <p className="startup-secondary">
          Please wait approximately 1 minute while the service starts.
        </p>

        <div className="startup-status">
          <span className="startup-dot" />
          Checking server status...
        </div>

        <p className="startup-elapsed">
          {elapsedSeconds}s elapsed
        </p>
      </section>
    </main>
  );
}