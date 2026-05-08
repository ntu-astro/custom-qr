// Pinterest-style empty-state illustration for the Custom tab.
// Concept: line-art camera whose lens contains a halftone QR pattern.
export function CustomTabIllustration() {
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full" aria-hidden="true">
      <circle cx="120" cy="120" r="96" fill="#FFF7E8" />

      {/* Camera body */}
      <g stroke="#0F172A" strokeWidth="2.5" fill="white" strokeLinejoin="round">
        <path d="M60,98 L84,98 L92,86 L148,86 L156,98 L180,98 L180,158 L60,158 Z" />
      </g>
      {/* Lens outer */}
      <circle cx="120" cy="128" r="26" fill="white" stroke="#0F172A" strokeWidth="2.5" />
      {/* Lens inner — halftone QR */}
      <g>
        <circle cx="120" cy="128" r="20" fill="#1E3A8A" />
        <g fill="#FDE68A">
          {Array.from({ length: 7 }).map((_, row) =>
            Array.from({ length: 7 }).map((_, col) => {
              const x = 105 + col * 5;
              const y = 113 + row * 5;
              const dx = x - 120;
              const dy = y - 128;
              if (dx * dx + dy * dy > 18 * 18) return null;
              const r = 0.6 + ((row * 3 + col * 5) % 4) * 0.4;
              return <circle key={`${row}-${col}`} cx={x} cy={y} r={r} />;
            }),
          )}
        </g>
      </g>
      {/* Flash */}
      <rect x="148" y="92" width="14" height="6" fill="#0F172A" />

      {/* Sparkles */}
      <g stroke="#0F172A" strokeWidth="2" strokeLinecap="round">
        <line x1="64" y1="74" x2="64" y2="84" />
        <line x1="59" y1="79" x2="69" y2="79" />
      </g>
      <g stroke="#0F172A" strokeWidth="1.6" strokeLinecap="round">
        <line x1="186" y1="174" x2="186" y2="182" />
        <line x1="182" y1="178" x2="190" y2="178" />
      </g>

      {/* Plus indicator — "add your own" */}
      <g transform="translate(174 60)">
        <circle r="14" fill="#F87171" stroke="#0F172A" strokeWidth="2" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
