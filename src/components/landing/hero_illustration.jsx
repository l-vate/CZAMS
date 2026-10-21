// The hero picture: a split-type aircon on a wall, with soft lines of cool air and a few slow particles. Pure SVG and CSS (landing.css
// animates .lp-flow and .lp-drift, and switches both off for prefers-reduced-motion). It is replaced by a real photo when
// HERO_IMAGE is set in config/landingContent.js.
const FLOW_LINES = [
  'M118 196 C 100 250, 140 280, 112 350',
  'M188 196 C 176 262, 214 290, 190 366',
  'M260 196 C 252 250, 284 288, 262 372',
  'M332 196 C 340 256, 304 288, 336 362',
  'M402 196 C 424 252, 384 282, 410 346',
];

// x, y, size scale, drift delay (s), drift length (s), kind
const PARTICLES = [
  [98, 236, 1, 0, 16, 'flake'],
  [168, 300, 0.7, 3, 19, 'dot'],
  [236, 262, 1.2, 6, 22, 'flake'],
  [292, 330, 0.8, 1, 17, 'dot'],
  [352, 246, 1, 9, 20, 'flake'],
  [408, 308, 0.7, 4, 18, 'dot'],
  [140, 340, 0.6, 8, 21, 'dot'],
];

function HeroIllustration() {
  return (
    <svg
      className="lp-illustration"
      viewBox="0 0 520 420"
      width="520"
      height="420"
      role="img"
      aria-label="Illustration of a split-type aircon blowing cool air"
    >
      <defs>
        <linearGradient id="lp-unit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3f0f4" />
        </linearGradient>
        <linearGradient id="lp-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="260" cy="388" rx="190" ry="14" fill="#000000" opacity="0.12" />
      <path d="M70 190 H450 L520 420 H0 Z" fill="url(#lp-glow)" />

      <g>
        <rect x="62" y="64" width="396" height="124" rx="24" fill="url(#lp-unit)" />
        <rect x="62" y="64" width="396" height="124" rx="24" fill="none" stroke="#ffffff" strokeOpacity="0.6" />
        <path d="M92 92 H428" stroke="#c4dbe3" strokeWidth="3" strokeLinecap="round" />
        <path d="M92 106 H428" stroke="#d6e7ed" strokeWidth="3" strokeLinecap="round" />
        <rect x="88" y="164" width="344" height="14" rx="7" fill="#b7d2dc" />
        <rect x="88" y="170" width="344" height="8" rx="4" fill="#9fc0cc" />
        <rect x="378" y="118" width="46" height="22" rx="8" fill="#0b2545" />
        <circle cx="392" cy="129" r="4" fill="#ff6b4a" />
        <circle cx="408" cy="129" r="4" fill="#0e8c8c" />
        <rect x="96" y="120" width="60" height="8" rx="4" fill="#c4dbe3" />
      </g>

      <g fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth="3">
        {FLOW_LINES.map((d, i) => (
          <path key={d} d={d} className="lp-flow" style={{ animationDelay: `${i * 0.7}s` }} />
        ))}
      </g>

      {PARTICLES.map(([x, y, scale, delay, seconds, kind]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
          <g className="lp-drift" style={{ animationDelay: `${delay}s`, animationDuration: `${seconds}s` }}>
            {kind === 'flake' ? (
              <path d="M0 -9V9M-8 -4.5L8 4.5M-8 4.5L8 -4.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
            ) : (
              <circle r="4" fill="#ffffff" />
            )}
          </g>
        </g>
      ))}
    </svg>
  );
}

export default HeroIllustration;
