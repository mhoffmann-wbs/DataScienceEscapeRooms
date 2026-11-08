import { describe, expect, it } from 'vitest';
import type { SqlTableInfo } from '../runners/protocol';
import { layoutSchema } from './schemaLayout';

const table = (name: string, columns: string[], refs: SqlTableInfo['refs'] = [], pk = [columns[0]!]): SqlTableInfo => ({ name, columns, types: columns.map(() => 'TEXT'), pk, refs });

describe('layoutSchema', () => {
  const tables = [
    table('scans', ['scan_id', 'ticket_id'], [{ from: 'ticket_id', table: 'passengers', to: 'ticket_id' }]),
    table('passengers', ['ticket_id', 'name', 'card']),
    table('taps', ['tap_id', 'card'], [{ from: 'card', table: 'passengers', to: 'card' }]),
    table('speed', ['time', 'kmh']),
  ];

  it('puts the most referenced table in the middle column and no boxes overlap', () => {
    const { boxes } = layoutSchema(tables);
    const xs = [...new Set(boxes.map((b) => b.x))].sort((a, b) => a - b);
    expect(xs).toHaveLength(3);
    expect(boxes.find((b) => b.table.name === 'passengers')!.x).toBe(xs[1]);
    for (const a of boxes)
      for (const b of boxes)
        if (a !== b) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
  });

  it('draws a link per foreign key from the referencing row to the referenced row', () => {
    const { links, boxes } = layoutSchema(tables);
    expect(links.map((l) => `${l.from.table}.${l.from.column}>${l.to.table}.${l.to.column}`).sort()).toEqual(['scans.ticket_id>passengers.ticket_id', 'taps.card>passengers.card']);
    const passengers = boxes.find((b) => b.table.name === 'passengers')!;
    const end = links.find((l) => l.from.table === 'taps')!.path.split(' ').slice(-2).map(Number);
    expect(end[1]).toBe(passengers.y + 28 + 20 * 2 + 10);
  });

  it('falls back to the primary key and skips tables that are not there', () => {
    const { links } = layoutSchema([table('a', ['id', 'b_id'], [{ from: 'b_id', table: 'b', to: '' }, { from: 'id', table: 'missing', to: 'x' }]), table('b', ['key', 'v'])]);
    expect(links.map((l) => l.to)).toEqual([{ table: 'b', column: 'key' }]);
  });
});
