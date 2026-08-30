import { useSession } from '../../context/SessionContext.jsx';
import PeerBadge from './PeerBadge.jsx';

export default function PeerList() {
  const { peers, room, connStates, kickPeer } = useSession();
  const isHostView = !!room?.isHost;

  return (
    <div className="peers-col">
      <h2 className="col-title">
        Peers <span className="col-title__count">{peers.length}</span>
      </h2>
      <ul className="peer-list">
        {peers.map((p) => {
          const isSelf = p.peerId === room?.selfPeerId;
          return (
            <PeerBadge
              key={p.peerId}
              peer={p}
              isSelf={isSelf}
              connState={connStates[p.peerId]}
              canKick={isHostView && !isSelf}
              onKick={() => kickPeer(p.peerId)}
            />
          );
        })}
      </ul>
    </div>
  );
}
