import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SqlTableInfo } from '../runners/protocol';
import { columnLabel, HEADER, layoutSchema, ROW } from './schemaLayout';

/** The station's database as boxes and lines. Pointing at a table highlights its foreign keys. */
export function SchemaDiagram({ tables }: { tables: SqlTableInfo[] }) {
  const { t } = useTranslation();
  const layout = useMemo(() => layoutSchema(tables), [tables]);
  const [focus, setFocus] = useState<string | null>(null);
  const touches = (l: (typeof layout.links)[number]) => focus !== null && (l.from.table === focus || l.to.table === focus);

  return (
    <div className="schema-diagram">
      <svg viewBox={`-2 -2 ${layout.width + 4} ${layout.height + 4}`} width={layout.width + 4} role="img" aria-label={t('puzzle.diagramLabel', { count: tables.length })}>
        <defs>
          <marker id="schema-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="schema-arrowhead" />
          </marker>
        </defs>
        {layout.boxes.map((b) => (
          <g key={b.table.name} transform={`translate(${b.x} ${b.y})`} className={focus === b.table.name ? 'schema-table focus' : 'schema-table'} onMouseEnter={() => setFocus(b.table.name)} onMouseLeave={() => setFocus(null)}>
            <rect width={b.width} height={b.height} rx="6" className="schema-box" />
            <path d={`M 0 ${HEADER} H ${b.width}`} className="schema-rule" />
            <text x="12" y={HEADER - 9} className="schema-name">
              {b.table.name}
            </text>
            {b.table.columns.map((c, i) => {
              const fk = b.table.refs.some((r) => r.from === c);
              return (
                <text key={c} x="12" y={HEADER + ROW * i + 14} className={b.table.pk.includes(c) ? 'schema-col pk' : fk ? 'schema-col fk' : 'schema-col'}>
                  <tspan className="schema-mark">{b.table.pk.includes(c) ? '🔑' : fk ? '→' : ''}</tspan>
                  <tspan x="32">{columnLabel(b.table, i)}</tspan>
                </text>
              );
            })}
          </g>
        ))}
        {layout.links.map((l) => (
          <path key={`${l.from.table}.${l.from.column}`} d={l.path} className={touches(l) ? 'schema-link focus' : 'schema-link'} markerEnd="url(#schema-arrow)">
            <title>{`${l.from.table}.${l.from.column} → ${l.to.table}.${l.to.column}`}</title>
          </path>
        ))}
      </svg>
      <p className="muted">{layout.links.length > 0 ? t('puzzle.diagramLegend') : t('puzzle.diagramNoLinks')}</p>
    </div>
  );
}
