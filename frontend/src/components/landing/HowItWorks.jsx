const STEPS = [
  {
    n: '01',
    text: 'Host creates a room. The signaling server hands back a short code.',
  },
  {
    n: '02',
    text: 'Peers join with the code. Each browser exchanges peer browser information.',
  },
  {
    n: '03',
    text: 'Every peer opens a direct channel to every other peer, forming a full mesh of up to 5 nodes.',
  },
  {
    n: '04',
    text: 'Share a file and it appears for everyone with a Download button. Bytes only move, peer-to-peer, when someone actually clicks it.',
  },
];

export default function HowItWorks() {
  return (
    <section className="how-it-works">
      <h2 className="section-title">How transfer works</h2>
      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="step-index">{s.n}</span>
            <span className="step-text">{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
