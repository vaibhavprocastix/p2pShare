import { initialsOf, NODE_COLORS } from '../../lib/format.js';

function stateLabel(state) {
  switch (state) {
    case 'connected':
    case 'channel-open':
      return 'connected';
    case 'connecting':
    case 'new':
    case undefined:
      return 'connecting…';
    case 'disconnected':
      return 'reconnecting…';
    case 'failed':
      return 'connection failed';
    case 'channel-closed':
    case 'closed':
      return 'disconnected';
    default:
      return state;
  }
}

// Deterministic color per peer, independent of render order.
function colorForPeer(peerId) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0;
  return NODE_COLORS[hash % NODE_COLORS.length];
}

export default function PeerBadge({ peer, isSelf, connState, canKick, onKick }) {
  const state = isSelf ? 'connected' : connState;
  const isConnected = state === 'connected' || state === 'channel-open';
  const color = colorForPeer(peer.peerId);

  return (
    <li className="peer-badge">
      <span className="peer-badge__avatar" style={{ color, boxShadow: `inset 0 0 0 1.5px ${color}55` }}>
        {initialsOf(peer.name)}
      </span>
      <span className="peer-badge__meta">
        <span className="peer-badge__name">
          {peer.name}
          {peer.isHost && <span className="host-tag">Host</span>}
          {isSelf && <span className="you-tag">(you)</span>}
        </span>
        <span className={`peer-badge__status ${isConnected ? 'is-connected' : 'is-connecting'}`}>
          {isSelf ? 'this device' : stateLabel(state)}
        </span>
      </span>
      {canKick && (
        <button className="btn btn--danger btn--small" type="button" title={`Remove ${peer.name} from the room`} onClick={onKick}>
          Kick
        </button>
      )}
    </li>
  );
}
