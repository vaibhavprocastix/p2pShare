import { useEffect, useState } from 'react';
import { fetchHealth } from '../lib/api.js';
import '../styles/startup.css';

const CHECK_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;
const EXPECTED_STARTUP_SECONDS = 50;

export default function BackendStartupPage({ onReady }) {
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
          onReady();
          return;
        }
      } catch {
        // Backend is still waking up or temporarily unavailable.
      } finally {
        clearTimeout(timeout);
      }

      if (!cancelled) {
        retryTimer = setTimeout(checkBackend, CHECK_INTERVAL_MS);
      }
    };

    elapsedTimer = setInterval(() => {
      if (!cancelled) {
        setElapsedSeconds((seconds) => {
          if (seconds >= EXPECTED_STARTUP_SECONDS) {
            return EXPECTED_STARTUP_SECONDS;
          }

          return seconds + 1;
        });
      }
    }, 1000);

    checkBackend();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(elapsedTimer);
    };
  }, [onReady]);

  const progress = Math.min(
    (elapsedSeconds / EXPECTED_STARTUP_SECONDS) * 100,
    100
  );

  return (
    <main className="startup-page">
      <section className="startup-card" aria-live="polite">

        <h1>Starting the service</h1>

        <p className="startup-primary">
          This app is hosted on a free-tier server.
        </p>

        <p className="startup-secondary">
          Please wait until the server starts.
        </p>

        <div className="health-loader">
          <div className="health-loader-header">
            <span>Loading server</span>
            <strong>{Math.round(progress)}%</strong>
          </div>

          <div
            className="health-loader-track"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Server startup progress"
          >
            <div
              className="health-loader-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* <div className="health-loader-time">
            {elapsedSeconds < EXPECTED_STARTUP_SECONDS
              ? `Starting service... ${elapsedSeconds}s`
              : 'Still waiting for the service...'}
          </div> */}
        </div>

      </section>
    </main>
  );
}