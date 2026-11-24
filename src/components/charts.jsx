// Small hand-written SVG charts for the admin dashboard, Analytics and Reports pages.
//
// Why not a chart library: only three simple chart types are needed, SVG with a
// viewBox scales to any width (phone to A4) with no JavaScript measuring, and it
// prints through window.print() exactly as it looks on screen. A library would add
// dependencies and responsive containers that size themselves from the screen.
//
// Colors are the app's own CSS tokens (var(--primary) etc.), so charts follow the theme.

const W = 360; // viewBox width. Narrow on purpose so text stays readable when scaled to a phone.

function EmptyChart({ message = 'No data yet' }) {
  return <p className="chart-empty">{message}</p>;
}

// Round a maximum up to a tidy axis: returns { step, max } with whole-number ticks.
// A small maximum keeps its plain whole-number steps (a maximum of 7 gives 0, 2, 4, 6, 8). From a step of 10 up, the step is rounded to 1, 2, 2.5 or 5
// times a power of ten, so a maximum of 16,500 gives 0, 5,000, 10,000, 15,000, 20,000 and not 0, 4,125, 8,250 ...
function niceAxis(maxValue, tickCount = 4) {
  const plain = Math.max(1, Math.ceil(maxValue / tickCount));
  if (plain < 10) return { step: plain, max: plain * tickCount };
  const power = 10 ** Math.floor(Math.log10(plain));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * power).find((candidate) => candidate >= plain && Number.isInteger(candidate)) || plain;
  return { step, max: step * tickCount };
}

// 16500 -> "16,500": the numbers on a chart are read at a glance.
const fmt = (n) => Number(n).toLocaleString('en-PH');

// 17900 -> "17.9k" for bars too narrow to carry the whole number.
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/.0$/, '')}k` : String(n));

// A label that would run into its neighbour is split at its last space ("Jun 2026" -> "Jun" over "2026"). About 6 px a letter at the 11 px chart text.
function labelLines(label, room) {
  const text = String(label);
  const at = text.lastIndexOf(' ');
  return text.length * 6 > room && at > 0 ? [text.slice(0, at), text.slice(at + 1)] : [text];
}

function truncate(text, length) {
  const s = String(text || '');
  return s.length > length ? `${s.slice(0, length - 1)}…` : s;
}

// Vertical bar chart. data: [{ label, value }]
export function BarChart({ data, color = 'var(--primary)', xLabel, yLabel, ariaLabel }) {
  const total = (data || []).reduce((sum, d) => sum + d.value, 0);
  if (!data || data.length === 0 || total === 0) return <EmptyChart />;

  const H = 250;
  const { step, max } = niceAxis(Math.max(...data.map((d) => d.value)));
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  // the left margin fits the widest number and, left of it, the title of the axis, so the two never overlap
  const widestTick = Math.max(...ticks.map((t) => fmt(t).length)) * 6.2;
  const m = { top: 22, right: 10, bottom: 56, left: Math.max(42, Math.ceil((yLabel ? 22 : 8) + widestTick + 8)) };
  const innerW = W - m.left - m.right;
  const innerH = H - m.top - m.bottom;
  const band = innerW / data.length;
  const barW = Math.min(36, band * 0.62);
  const narrow = band < 40;
  const y = (v) => m.top + innerH - (v / max) * innerH;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={m.left - 6} y={y(t) + 3} textAnchor="end" className="chart-tick">{fmt(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = m.left + band * i + band / 2;
        return (
          <g key={d.label}>
            <rect
              x={cx - barW / 2}
              y={y(d.value)}
              width={barW}
              height={Math.max(0, m.top + innerH - y(d.value))}
              rx="3"
              style={{ fill: color }}
            >
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
            </rect>
            {d.value > 0 && (
              <text x={cx} y={y(d.value) - 4} textAnchor="middle" className="chart-value">{narrow ? compact(d.value) : fmt(d.value)}</text>
            )}
            <text textAnchor="middle" className="chart-tick">
              {labelLines(d.label, band - 2).map((line, n) => {
                // narrow bars: the year of a month label is written once, where it starts or changes, not under every bar
                const repeatedYear = narrow && n === 1 && i > 0 && labelLines(data[i - 1].label, band - 2)[1] === line;
                return <tspan key={line} x={cx} y={m.top + innerH + 14 + n * 12}>{repeatedYear ? '' : line}</tspan>;
              })}
            </text>
          </g>
        );
      })}
      <line x1={m.left} x2={m.left} y1={m.top} y2={m.top + innerH} className="chart-axis" />
      <line x1={m.left} x2={W - m.right} y1={m.top + innerH} y2={m.top + innerH} className="chart-axis" />
      {yLabel && (
        <text transform={`translate(10 ${m.top + innerH / 2}) rotate(-90)`} textAnchor="middle" className="chart-axis-title">{yLabel}</text>
      )}
      {xLabel && (
        <text x={m.left + innerW / 2} y={H - 8} textAnchor="middle" className="chart-axis-title">{xLabel}</text>
      )}
    </svg>
  );
}

// Horizontal bar chart. data: [{ label, value }] (already sorted the way it should read)
export function HorizontalBarChart({ data, color = 'var(--success)', xLabel, ariaLabel }) {
  const total = (data || []).reduce((sum, d) => sum + d.value, 0);
  if (!data || data.length === 0 || total === 0) return <EmptyChart />;

  const rowH = 30;
  const m = { top: 8, right: 26, bottom: 46, left: 104 };
  const H = m.top + data.length * rowH + m.bottom;
  const innerW = W - m.left - m.right;
  const { step, max } = niceAxis(Math.max(...data.map((d) => d.value)));
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const x = (v) => m.left + (v / max) * innerW;
  const axisY = m.top + data.length * rowH;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={m.top} y2={axisY} className="chart-grid" />
          <text x={x(t)} y={axisY + 14} textAnchor="middle" className="chart-tick">{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cy = m.top + i * rowH + rowH / 2;
        return (
          <g key={d.label}>
            <text x={m.left - 8} y={cy + 3} textAnchor="end" className="chart-tick">
              {truncate(d.label, 16)}
              <title>{d.label}</title>
            </text>
            <rect x={m.left} y={cy - 9} width={Math.max(0, x(d.value) - m.left)} height="18" rx="3" style={{ fill: color }}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            <text x={x(d.value) + 4} y={cy + 3} className="chart-value">{d.value}</text>
          </g>
        );
      })}
      <line x1={m.left} x2={m.left} y1={m.top} y2={axisY} className="chart-axis" />
      <line x1={m.left} x2={W - m.right} y1={axisY} y2={axisY} className="chart-axis" />
      {xLabel && (
        <text x={m.left + innerW / 2} y={H - 8} textAnchor="middle" className="chart-axis-title">{xLabel}</text>
      )}
    </svg>
  );
}

// Donut chart with a legend that carries the numbers. data: [{ label, value, color }]
export function DonutChart({ data, centerLabel = 'Total', ariaLabel }) {
  const total = (data || []).reduce((sum, d) => sum + d.value, 0);
  if (!data || data.length === 0 || total === 0) return <EmptyChart />;

  const r = 62;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="chart-donut">
      <svg className="chart-svg chart-svg--donut" viewBox="0 0 180 180" role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <g transform="rotate(-90 90 90)">
          {data.filter((d) => d.value > 0).map((d) => {
            const length = (d.value / total) * circumference;
            const segment = (
              <circle
                key={d.label}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                strokeWidth="26"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                style={{ stroke: d.color }}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </circle>
            );
            offset += length;
            return segment;
          })}
        </g>
        <text x="90" y="88" textAnchor="middle" className="chart-donut-total">{total}</text>
        <text x="90" y="106" textAnchor="middle" className="chart-tick">{centerLabel}</text>
      </svg>
      <ul className="chart-legend">
        {data.map((d) => (
          <li key={d.label}>
            <span className="chart-legend-swatch" style={{ background: d.color }} />
            <span className="chart-legend-label">{d.label}</span>
            <span className="chart-legend-value">{d.value} ({Math.round((d.value / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A titled card around one chart.
export function ChartCard({ title, children }) {
  return (
    <section className="chart-card">
      <h3 className="chart-card-title">{title}</h3>
      {children}
    </section>
  );
}
