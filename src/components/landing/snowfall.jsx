import '../../css/snow.css';

// A slow, soft snowfall behind the whole page (it lives in the fixed .lp-backdrop). Pure CSS: each flake is a span with its own position, size, speed and sway, set
// through custom properties; landing.css makes them fall and turns it all off for prefers-reduced-motion. Fixed numbers (no random), so
// the picture is the same on every load. The layer is decorative and hidden from assistive technology.
// x (% from the left), size (px), seconds to fall, start delay (s), sideways sway (px), opacity, kind
const FLAKES = [
  [4, 14, 26, 0, 26, 0.55, 'flake'],
  [11, 8, 20, 6, -18, 0.4, 'dot'],
  [18, 18, 30, 12, 30, 0.5, 'flake'],
  [26, 10, 22, 3, -22, 0.45, 'dot'],
  [33, 16, 28, 9, 24, 0.55, 'flake'],
  [41, 9, 19, 14, -16, 0.4, 'dot'],
  [48, 20, 32, 1, 34, 0.45, 'flake'],
  [55, 11, 23, 8, -20, 0.5, 'dot'],
  [62, 15, 27, 16, 28, 0.55, 'flake'],
  [69, 8, 18, 4, -14, 0.4, 'dot'],
  [76, 18, 31, 11, -30, 0.5, 'flake'],
  [83, 10, 21, 18, 18, 0.45, 'dot'],
  [90, 14, 25, 7, -24, 0.55, 'flake'],
  [96, 9, 20, 13, 16, 0.4, 'dot'],
];

function Snowfall({ className = '' }) {
  return (
    <div className={`lp-snow ${className}`} aria-hidden="true">
      {FLAKES.map(([x, size, seconds, delay, sway, opacity, kind]) => (
        <span
          key={`${x}-${size}`}
          className={`lp-flake lp-flake--${kind}`}
          style={{ '--x': `${x}%`, '--s': `${size}px`, '--d': `${seconds}s`, '--delay': `-${delay}s`, '--sway': `${sway}px`, '--o': opacity }}
        />
      ))}
    </div>
  );
}

export default Snowfall;
