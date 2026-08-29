import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext.jsx';
import { CONFIG } from '../config.js';
import CreateRoomForm from '../components/landing/CreateRoomForm.jsx';
import JoinRoomForm from '../components/landing/JoinRoomForm.jsx';
import HowItWorks from '../components/landing/HowItWorks.jsx';

const STATUS_COPY = {
  connecting: { dot: 'dot--pending', text: 'connecting to signaling…' },
  online: { dot: 'dot--online', text: 'signaling connected' },
  offline: { dot: 'dot--offline', text: 'signaling disconnected — retrying…' },
};

export default function LandingPage() {
  const { serverStatus, landingError } = useSession();

  // A shared invite link (?room=CODE) opens straight into the Join tab, prefilled.
  const prefillCode = useMemo(() => new URLSearchParams(window.location.search).get('room') || '', []);
  const [activeTab, setActiveTab] = useState(prefillCode ? 'join' : 'create');

  useEffect(() => {
    if (prefillCode) setActiveTab('join');
  }, [prefillCode]);

  const status = STATUS_COPY[serverStatus] || STATUS_COPY.connecting;

  return (
    <main className="screen screen--landing">
      <header className="topbar">
        <div className="brand">
          <span aria-hidden="true">
            <svg viewBox="0 0 40 40" width="28" height="28">
              <circle cx="20" cy="10" r="4" fill="var(--accent)" />
              <circle cx="32" cy="30" r="4" fill="var(--accent)" />
              <circle cx="8" cy="30" r="4" fill="var(--accent)" />
              <path d="M20 10 L32 30 L8 30 Z" stroke="var(--accent)" strokeWidth="1.6" fill="none" opacity="0.7" />
            </svg>
          </span>
          <span className="brand__name">
            p2p<em>Share</em>
          </span>
        </div>
        <span className="pill pill--muted">
          <span className={`dot ${status.dot}`} /> {status.text}
        </span>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Zero uploads · Zero storage · Full mesh WebRTC</p>
          <h1 className="hero__title">Your files never touch a server.</h1>
          <p className="hero__lede">
            p2pShare opens a direct, encrypted data channel between your browser and up to four others.
            Share a file once and everyone in the room sees it instantly with a Download button — the
            bytes only move, peer-to-peer, the moment someone actually clicks it.
          </p>
          <ul className="hero__facts">
            <li>
              <span className="fact__num">{CONFIG.MAX_ROOM_CAPACITY}</span>
              <span className="fact__label">peers per room, full mesh</span>
            </li>
            <li>
              <span className="fact__num">64KB</span>
              <span className="fact__label">chunked transfer, backpressure-safe</span>
            </li>
            <li>
              <span className="fact__num">0</span>
              <span className="fact__label">files ever stored server-side</span>
            </li>
          </ul>
        </div>

        <div className="hero__panel">
          <div className="panel-tabs" role="tablist">
            <button
              type="button"
              className={`panel-tab${activeTab === 'create' ? ' is-active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'create'}
              onClick={() => setActiveTab('create')}
            >
              Create a room
            </button>
            <button
              type="button"
              className={`panel-tab${activeTab === 'join' ? ' is-active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'join'}
              onClick={() => setActiveTab('join')}
            >
              Join a room
            </button>
          </div>

          {activeTab === 'create' ? <CreateRoomForm /> : <JoinRoomForm prefillCode={prefillCode} />}

          {landingError && (
            <p className="panel-error" role="alert">
              {landingError}
            </p>
          )}
        </div>
      </section>

      <HowItWorks />

      <footer className="site-footer">
        <span>p2pShare — signaling only, transfer is yours.</span>
      </footer>
    </main>
  );
}
