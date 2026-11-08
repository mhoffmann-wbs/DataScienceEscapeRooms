import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImagePlot, Plot, ScatterPlot, SeriesPlot } from '../runners/protocol';

// Charts from show_plot / show_hist / show_bars / plot_acf / plot_pacf. Plain SVG: lines for
// series, bars for correlograms (with the ±significance band) and grouped columns for
// histograms and bar charts, a hover readout, and a data table for screen readers.
// Colors are the validated categorical slots 1–3 (see styles.css).
// show_images draws greyscale images instead, one small pixelated canvas each.
// show_scatter draws points in up to 8 groups. Past three, no set of colors stays apart in
// every pair, so each group also has its own marker shape (composite encoding): color is never
// the only way to tell two groups apart.

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
  if (plot.kind === 'images') return <ImageGrid plot={plot} />;
  if (plot.kind === 'scatter') return <ScatterChart plot={plot} />;
  return <SeriesChart plot={plot} />;
}

/** Draws one image's pixels, scaled from vmin..vmax to black..white (or reversed). */
function PixelCanvas({ image, plot, label, onHover }: { image: ImagePlot['images'][number]; plot: ImagePlot; label: string; onHover: (pixel: number | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const data = ctx.createImageData(image.width, image.height);
    const span = plot.vmax - plot.vmin || 1;
    image.pixels.forEach((v, i) => {
      const f = Math.min(1, Math.max(0, (v - plot.vmin) / span));
      const g = Math.round((plot.reversed ? 1 - f : f) * 255);
      data.data.set([g, g, g, 255], i * 4);
    });
    ctx.putImageData(data, 0, 0);
  }, [image, plot]);
  const onMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - box.left) / box.width) * image.width);
    const row = Math.floor(((e.clientY - box.top) / box.height) * image.height);
    onHover(col >= 0 && col < image.width && row >= 0 && row < image.height ? row * image.width + col : null);
  };
  return (
    <canvas
      ref={ref}
      width={image.width}
      height={image.height}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
      role="img"
      aria-label={label}
      onMouseMove={onMove}
      onMouseLeave={() => onHover(null)}
    />
  );
}

function ImageGrid({ plot }: { plot: ImagePlot }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<{ image: number; pixel: number } | null>(null);
  const shown = hover && plot.images[hover.image];
  return (
    <figure className="chart">
      {plot.title && <figcaption className="chart-title">{plot.title}</figcaption>}
      <div className="chart-images">
        {plot.images.map((image, i) => {
          const label = image.label ?? t('chart.image', { n: i });
          return (
            <div key={i} className="chart-image">
              <PixelCanvas image={image} plot={plot} label={label} onHover={(pixel) => setHover(pixel === null ? null : { image: i, pixel })} />
              {image.label !== null && <span>{image.label}</span>}
            </div>
          );
        })}
      </div>
      <div className="chart-pixel" aria-live="polite">
        {shown && hover
          ? t('chart.pixel', {
              image: shown.label ?? hover.image,
              row: Math.floor(hover.pixel / shown.width),
              col: hover.pixel % shown.width,
              value: shown.pixels[hover.pixel],
            })
          : '\u00a0'}
      </div>
    </figure>
  );
}

function SeriesChart({ plot }: { plot: SeriesPlot }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const n = plot.x.length;
  const all = plot.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (n === 0 || all.length === 0) return null;

  const bar = plot.kind !== 'line';
  // Correlograms label their x values as lags; histograms and bar charts show them as they are.
  const lagged = plot.kind === 'bar';
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
            ? plot.series.flatMap((s, k) => {
                // Several series share a slot side by side.
                const w = Math.max(2, slot - 4) / plot.series.length;
                return s.values.map((v, i) =>
                  v === null ? null : (
                    <rect
                      key={`${k}-${i}`}
                      className={`series-${(k % 3) + 1} ${hover === i ? 'hovered' : ''}`}
                      x={xAt(i) - Math.max(1, slot / 2 - 2) + k * w}
                      width={Math.max(1, w - (plot.series.length > 1 ? 1 : 0))}
                      y={Math.min(yAt(v), yAt(0))}
                      height={Math.max(1, Math.abs(yAt(v) - yAt(0)))}
                      rx={plot.series.length > 1 ? 1 : 2}
                    />
                  ),
                );
              })
            : plot.series.map((s, i) => <path key={i} className={`chart-line series-${(i % 3) + 1}`} d={path(s.values)} />)}
          {hover !== null && !bar && <line className="chart-crosshair" x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={H - PAD.bottom} />}
        </svg>
        {hover !== null && (
          <div className="chart-tooltip" style={{ left: `${(xAt(hover) / W) * 100}%` }}>
            <strong>{lagged ? `${t('chart.lag')} ${String(plot.x[hover])}` : String(plot.x[hover])}</strong>
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
              <th>{lagged ? t('chart.lag') : 'x'}</th>
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

const SCATTER_H = 320;
const SCATTER_PAD = { left: 52, right: 12, top: 10, bottom: 38 };

/** Marker `shape` (0–7: circle, square, triangle, diamond, triangle down, plus, cross, star) centred on x, y. */
function Marker({ shape, x, y, className }: { shape: number; x: number; y: number; className: string }) {
  const r = 3.6;
  const poly = (pts: [number, number][]) => <polygon className={className} points={pts.map(([a, b]) => `${(x + a * r).toFixed(1)},${(y + b * r).toFixed(1)}`).join(' ')} />;
  switch (shape) {
    case 1:
      return <rect className={className} x={x - r * 0.85} y={y - r * 0.85} width={r * 1.7} height={r * 1.7} />;
    case 2:
      return poly([[0, -1.1], [1, 0.75], [-1, 0.75]]);
    case 3:
      return poly([[0, -1.15], [1.15, 0], [0, 1.15], [-1.15, 0]]);
    case 4:
      return poly([[0, 1.1], [1, -0.75], [-1, -0.75]]);
    case 5:
      return poly([[-0.35, -1.1], [0.35, -1.1], [0.35, -0.35], [1.1, -0.35], [1.1, 0.35], [0.35, 0.35], [0.35, 1.1], [-0.35, 1.1], [-0.35, 0.35], [-1.1, 0.35], [-1.1, -0.35], [-0.35, -0.35]]);
    case 6:
      return poly([[-1, -0.6], [-0.6, -1], [0, -0.4], [0.6, -1], [1, -0.6], [0.4, 0], [1, 0.6], [0.6, 1], [0, 0.4], [-0.6, 1], [-1, 0.6], [-0.4, 0]]);
    case 7:
      return poly([...Array(10).keys()].map((i) => {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const d = i % 2 ? 0.5 : 1.2;
        return [Math.cos(a) * d, Math.sin(a) * d] as [number, number];
      }));
    default:
      return <circle className={className} cx={x} cy={y} r={r} />;
  }
}

function Swatch({ group }: { group: number }) {
  return (
    <svg className="chart-marker" viewBox="0 0 12 12" aria-hidden>
      <Marker shape={group} x={6} y={6} className={`scatter-${group + 1}`} />
    </svg>
  );
}

function ScatterChart({ plot }: { plot: ScatterPlot }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const pts = plot.points;
  if (pts.length === 0) return null;

  const range = (values: number[]) => {
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
    const pad = (hi - lo) * 0.05;
    return [lo - pad, hi + pad] as const;
  };
  const [xlo, xhi] = range([...pts.map((p) => p[0]), ...plot.centers.map((c) => c[0])]);
  const [ylo, yhi] = range([...pts.map((p) => p[1]), ...plot.centers.map((c) => c[1])]);
  const innerW = W - SCATTER_PAD.left - SCATTER_PAD.right;
  const innerH = SCATTER_H - SCATTER_PAD.top - SCATTER_PAD.bottom;
  const xAt = (v: number) => SCATTER_PAD.left + ((v - xlo) / (xhi - xlo)) * innerW;
  const yAt = (v: number) => SCATTER_PAD.top + ((yhi - v) / (yhi - ylo)) * innerH;
  const groupName = (g: number) => plot.groups[g] ?? '';

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - box.left) / box.width) * W;
    const my = ((e.clientY - box.top) / box.height) * SCATTER_H;
    let best: number | null = null;
    let bestD = 12 * 12;
    pts.forEach(([x, y], i) => {
      const d = (xAt(x) - mx) ** 2 + (yAt(y) - my) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    });
    setHover(best);
  };
  const shown = hover === null ? null : pts[hover];

  return (
    <figure className="chart">
      {plot.title && <figcaption className="chart-title">{plot.title}</figcaption>}
      {plot.groups.length > 1 && (
        <ul className="chart-legend">
          {plot.groups.map((name, i) => (
            <li key={i}>
              <Swatch group={i} />
              {name}
            </li>
          ))}
        </ul>
      )}
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${W} ${SCATTER_H}`}
          role="img"
          aria-label={plot.title ?? [plot.xlabel, plot.ylabel].filter(Boolean).join(' / ')}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {niceTicks(ylo, yhi).map((v, i) => (
            <g key={`y${i}`} className="chart-grid">
              <line x1={SCATTER_PAD.left} x2={W - SCATTER_PAD.right} y1={yAt(v)} y2={yAt(v)} />
              <text x={SCATTER_PAD.left - 6} y={yAt(v) + 4} textAnchor="end">
                {fmt(v)}
              </text>
            </g>
          ))}
          {niceTicks(xlo, xhi).map((v, i) => (
            <g key={`x${i}`} className="chart-grid">
              <line x1={xAt(v)} x2={xAt(v)} y1={SCATTER_PAD.top} y2={SCATTER_H - SCATTER_PAD.bottom} />
              <text x={xAt(v)} y={SCATTER_H - SCATTER_PAD.bottom + 14} textAnchor="middle">
                {fmt(v)}
              </text>
            </g>
          ))}
          {plot.xlabel && (
            <text className="chart-axis" x={SCATTER_PAD.left + innerW / 2} y={SCATTER_H - 4} textAnchor="middle">
              {plot.xlabel}
            </text>
          )}
          {plot.ylabel && (
            <text className="chart-axis" x={SCATTER_PAD.left + 4} y={SCATTER_PAD.top + 10}>
              {plot.ylabel}
            </text>
          )}
          {pts.map(([x, y, g], i) => (
            <Marker key={i} shape={g} x={xAt(x)} y={yAt(y)} className={`scatter-point scatter-${g + 1}`} />
          ))}
          {plot.centers.map(([x, y], i) => (
            <g key={`c${i}`} className="chart-center">
              <line x1={xAt(x) - 7} x2={xAt(x) + 7} y1={yAt(y) - 7} y2={yAt(y) + 7} />
              <line x1={xAt(x) - 7} x2={xAt(x) + 7} y1={yAt(y) + 7} y2={yAt(y) - 7} />
            </g>
          ))}
          {shown && <circle className="chart-hover-ring" cx={xAt(shown[0])} cy={yAt(shown[1])} r={7} />}
        </svg>
        {shown && (
          <div className="chart-tooltip" style={{ left: `${(xAt(shown[0]) / W) * 100}%` }}>
            {plot.groups.length > 0 && (
              <strong>
                <Swatch group={shown[2]} />
                {groupName(shown[2])}
              </strong>
            )}
            <span>
              {plot.xlabel ?? 'x'}: {fmt(shown[0])}
            </span>
            <span>
              {plot.ylabel ?? 'y'}: {fmt(shown[1])}
            </span>
          </div>
        )}
      </div>
      <details className="chart-data">
        <summary>{t('chart.data')}</summary>
        <table>
          <thead>
            <tr>
              <th>{plot.xlabel ?? 'x'}</th>
              <th>{plot.ylabel ?? 'y'}</th>
              {plot.groups.length > 0 && <th>{t('chart.group')}</th>}
            </tr>
          </thead>
          <tbody>
            {pts.slice(0, MAX_TABLE_ROWS).map(([x, y, g], r) => (
              <tr key={r}>
                <td>{x}</td>
                <td>{y}</td>
                {plot.groups.length > 0 && <td>{groupName(g)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
