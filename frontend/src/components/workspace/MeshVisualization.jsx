import { useMemo } from 'react';
import { useSession } from '../../context/SessionContext.jsx';
import { initialsOf, NODE_COLORS } from '../../lib/format.js';

const W = 640;
const H = 160;
const CX = W / 2;
const CY = H / 2;

function colorFor(peerId, colorMap) {
  if (!colorMap.has(peerId)) colorMap.set(peerId, NODE_COLORS[colorMap.size % NODE_COLORS.length]);
  return colorMap.get(peerId);
}

export default function MeshVisualization() {
  const { peers, room, transfers } = useSession();

  const activeEdgePeerIds = useMemo(() => {
    const set = new Set();
    Object.values(transfers).forEach((t) => {
      if (t.status === 'active') set.add(t.peerId);
    });
    return set;
  }, [transfers]);

  const { edges, nodes } = useMemo(() => {
    const colorMap = new Map();
    const r = Math.min(70, 30 + peers.length * 6);
    const positions = new Map();
    peers.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / Math.max(peers.length, 1) - Math.PI / 2;
      positions.set(p.peerId, { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) });
    });

    const edgeEls = [];
    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const a = positions.get(peers[i].peerId);
        const b = positions.get(peers[j].peerId);
        const involvesSelf = peers[i].peerId === room?.selfPeerId || peers[j].peerId === room?.selfPeerId;
        const otherId = peers[i].peerId === room?.selfPeerId ? peers[j].peerId : peers[i].peerId;
        const isActive = involvesSelf && activeEdgePeerIds.has(otherId);
        edgeEls.push(
          <line
            key={`${peers[i].peerId}-${peers[j].peerId}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={isActive ? 'var(--accent)' : 'var(--border)'}
            strokeWidth={isActive ? 2 : 1}
            strokeDasharray={isActive ? '4 3' : 'none'}
            opacity={isActive ? 0.95 : 0.6}
          >
            {isActive && (
              <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.6s" repeatCount="indefinite" />
            )}
          </line>
        );
      }
    }

    const nodeEls = peers.map((p) => {
      const pos = positions.get(p.peerId);
      const color = colorFor(p.peerId, colorMap);
      const isSelf = p.peerId === room?.selfPeerId;
      return (
        <g key={p.peerId}>
          <circle cx={pos.x} cy={pos.y} r={isSelf ? 15 : 13} fill="var(--bg-raised)" stroke={color} strokeWidth={p.isHost ? 2.5 : 1.5} />
          <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={color}>
            {initialsOf(p.name)}
          </text>
        </g>
      );
    });

    return { edges: edgeEls, nodes: nodeEls };
  }, [peers, room, activeEdgePeerIds]);

  return (
    <section className="mesh-strip" aria-label="Live peer mesh topology">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {edges}
        {nodes}
      </svg>
    </section>
  );
}
