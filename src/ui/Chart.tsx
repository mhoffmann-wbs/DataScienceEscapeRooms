import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Plot } from '../runners/protocol';

// Charts from show_plot / plot_acf / plot_pacf. Plain SVG: lines for series, bars for
// correlograms (with the ±significance band), a hover readout, and a data table for
// screen readers. Colors are the validated categorical slots 1–3 (see styles.css).

const W = 560;
const H = 200;
const PAD = { left: 52, right: 12, top: 10, bottom: 24 };
const MAX_TABLE_ROWS = 400;

const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a === 0) return '0';
  return v.toFixed(2);
};

/** About four round tick values (steps of 1, 2 or 5 × 10^k) inside [lo, hi]. */
function niceTicks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

export function Chart({ plot }: { plot: Plot }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const n = plot.x.length;
  const all = plot.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (n === 0 || all.length === 0) return null;

  const bar = plot.kind === 'bar';
  let lo = Math.min(...all, ...(bar ? [0, -(plot.band ?? 0)] : []));
  let hi = Math.max(...all, ...(bar ? [0, plot.band ?? 0] : []));
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const span = hi - lo;
  lo -= span * 0.05;
  hi += span * 0.05;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / n;
  const xAt = (i: number) => PAD.left + (bar ? slot * (i + 0.5) : n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH;
  const ticks = niceTicks(lo, hi);
  const xLabels = n <= 3 ? [...Array(n).keys()] : [0, Math.floor((n - 1) / 2), n - 1];

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = bar ? Math.floor((x - PAD.left) / slot) : Math.round(((x - PAD.left) / innerW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  const path = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <figure className="chart">
      {plot.title && <figcaption className="chart-title">{plot.title}</figcaption>}
      {plot.series.length > 1 && (
        <ul className="chart-legend">
          {plot.series.map((s, i) => (
            <li key={i}>
              <span className={`chart-swatch series-${(i % 3) + 1}`} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={plot.title ?? plot.series.map((s) => s.name).join(', ')} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((v, i) => (
            <g key={i} className="chart-grid">
              <line x1={PAD.left} x2={W - PAD.right} y1={yAt(v)} y2={yAt(v)} />
              <text x={PAD.left - 6} y={yAt(v) + 4} textAnchor="end">
                {fmt(v)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} className="chart-axis" x={xAt(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {String(plot.x[i])}
            </text>
          ))}
          {bar && <line className="chart-zero" x1={PAD.left} x2={W - PAD.right} y1={yAt(0)} y2={yAt(0)} />}
          {bar && plot.band !== null && (
            <>
              <line className="chart-band" x1={PAD.left} x2={W - PAD.right} y1={yAt(plot.band)} y2={yAt(plot.band)} />
              <line className="chart-band" x1={PAD.left} x2={W - PAD.right} y1={yAt(-plot.band)} y2={yAt(-plot.band)} />
            </>
          )}
          {bar
            ? plot.series[0]!.values.map((v, i) =>
                v === null ? null : (
                  <rect
                    key={i}
                    className={`series-1 ${hover === i ? 'hovered' : ''}`}
                    x={xAt(i) - Math.max(1, slot / 2 - 2)}
                    width={Math.max(2, slot - 4)}
                    y={Math.min(yAt(v), yAt(0))}
                    height={Math.max(1, Math.abs(yAt(v) - yAt(0)))}
                    rx={2}
                  />
                ),
              )
            : plot.series.map((s, i) => <path key={i} className={`chart-line series-${(i % 3) + 1}`} d={path(s.values)} />)}
          {hover !== null && !bar && <line className="chart-crosshair" x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={H - PAD.bottom} />}
        </svg>
        {hover !== null && (
          <div className="chart-tooltip" style={{ left: `${(xAt(hover) / W) * 100}%` }}>
            <strong>{bar ? `${t('chart.lag')} ${String(plot.x[hover])}` : String(plot.x[hover])}</strong>
            {plot.series.map((s, i) => {
              const v = s.values[hover];
              return v === null || v === undefined ? null : (
                <span key={i}>
                  {plot.series.length > 1 && <span className={`chart-swatch series-${(i % 3) + 1}`} aria-hidden />}
                  {plot.series.length > 1 ? `${s.name}: ` : ''}
                  {fmt(v)}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <details className="chart-data">
        <summary>{t('chart.data')}</summary>
        <table>
          <thead>
            <tr>
              <th>{bar ? t('chart.lag') : 'x'}</th>
              {plot.series.map((s, i) => (
                <th key={i}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plot.x.slice(0, MAX_TABLE_ROWS).map((x, r) => (
              <tr key={r}>
                <td>{String(x)}</td>
                {plot.series.map((s, i) => (
                  <td key={i}>{s.values[r] ?? '–'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
