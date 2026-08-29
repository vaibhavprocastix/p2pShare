import { useMemo } from 'react';
import { useSession } from '../../context/SessionContext.jsx';
import { formatBytes, formatSpeed } from '../../lib/format.js';

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-card__icon">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default function FileCard({ file }) {
  const { transfers, downloadFile, deleteFile } = useSession();

  // A downloadable file only ever has ONE uploader, so at most one active
  // inbound transfer can exist for it on this browser at a time.
  const incoming = useMemo(
    () => Object.values(transfers).find((t) => t.fileId === file.fileId && t.direction === 'in'),
    [transfers, file.fileId]
  );

  // For files we own, show anyone currently pulling it from us.
  const outgoing = useMemo(
    () => Object.values(transfers).filter((t) => t.fileId === file.fileId && t.direction === 'out' && t.status === 'active'),
    [transfers, file.fileId]
  );

  const pct = (t) => (t.fileSize > 0 ? Math.min(100, Math.round((t.bytesTransferred / t.fileSize) * 100)) : 0);

  return (
    <div className="file-card">
      <div className="file-card__row">
        <FileIcon />
        <span className="file-card__name">{file.fileName}</span>
        <span className="file-card__size">{formatBytes(file.fileSize)}</span>
      </div>

      <div className="file-card__meta">
        {file.isMine ? <span className="mine-tag">You</span> : <span>Shared by {file.uploaderName}</span>}
      </div>

      {!file.isMine && incoming && incoming.status === 'active' ? (
        <>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct(incoming)}%` }} />
          </div>
          <div className="file-card__stats">
            <span>
              {pct(incoming)}% · {formatBytes(incoming.bytesTransferred)} / {formatBytes(incoming.fileSize)}
            </span>
            <span>{formatSpeed(incoming.speedBps)}</span>
          </div>
        </>
      ) : (
        <div className="file-card__actions">
          <button className="btn btn--primary btn--small" type="button" onClick={() => downloadFile(file)}>
            {incoming && incoming.status === 'error' ? 'Retry download' : incoming && incoming.status === 'done' ? 'Download again' : 'Download'}
          </button>
          {file.isMine && (
            <button className="btn btn--danger btn--small" type="button" onClick={() => deleteFile(file)}>
              Delete
            </button>
          )}
        </div>
      )}

      {!file.isMine && incoming && incoming.status === 'error' && (
        <div className="file-card__stats">
          <span className="status-err">{incoming.error || 'Transfer failed'}</span>
        </div>
      )}

      {!file.isMine && incoming && incoming.status === 'done' && (
        <div className="file-card__stats">
          <span className="status-ok">
            Downloaded{incoming.verified && <span className="verified-tag">✓ Verified</span>}
          </span>
        </div>
      )}

      {file.isMine && outgoing.length > 0 && (
        <div className="file-card__outgoing">
          {outgoing.map((t) => (
            <div className="file-card__outgoing-row" key={t.transferId}>
              <span>Sending to {t.peerName}</span>
              <span className="mini-track">
                <span className="mini-fill" style={{ width: `${pct(t)}%` }} />
              </span>
              <span>{pct(t)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
