import { useState } from 'react';
import { useSession } from '../../context/SessionContext.jsx';

export default function WorkspaceHeader() {
  const { room, peers, copyRoomLink, leaveRoom, deleteRoom } = useSession();
  const [copied, setCopied] = useState(false);

  if (!room) return null;

  async function handleCopy() {
    await copyRoomLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <header className="ws-header">
      <div className="ws-header__left">
        <span className="brand brand--sm">
          <svg viewBox="0 0 40 40" width="22" height="22" aria-hidden="true">
            <circle cx="20" cy="10" r="4" fill="var(--accent)" />
            <circle cx="32" cy="30" r="4" fill="var(--accent)" />
            <circle cx="8" cy="30" r="4" fill="var(--accent)" />
            <path d="M20 10 L32 30 L8 30 Z" stroke="var(--accent)" strokeWidth="1.6" fill="none" opacity="0.7" />
          </svg>
          <span className="brand__name">
            p2p<em>Share</em>
          </span>
        </span>
        <span className="divider" aria-hidden="true" />
        <span className="room-code-badge">{room.displayCode}</span>
        <button className="icon-btn" type="button" title="Copy room link" onClick={handleCopy}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          <span>{copied ? 'Copied!' : 'Copy link'}</span>
        </button>
      </div>
      <div className="ws-header__right">
        <span className="pill">
          {peers.length} / {room.maxPeers} connected
        </span>
        {room.isHost ? (
          <button className="btn btn--danger" type="button" onClick={deleteRoom}>
            Delete room
          </button>
        ) : (
          <button className="btn btn--ghost" type="button" onClick={leaveRoom}>
            Leave room
          </button>
        )}
      </div>
    </header>
  );
}
