import type { SqlTableInfo } from '../runners/protocol';

// Layout of the database diagram: tables as boxes in columns, foreign keys as curves between their column rows.

export const HEADER = 28;
export const ROW = 20;
const CHAR = 7.4; // width of one character at the diagram's monospace font size
const PAD = 12;
const GAP_X = 72;
const GAP_Y = 24;

export interface TableBox {
  table: SqlTableInfo;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Link {
  from: { table: string; column: string };
  to: { table: string; column: string };
  /** SVG path from the referencing column to the referenced one. */
  path: string;
}

export interface SchemaLayout {
  boxes: TableBox[];
  links: Link[];
  width: number;
  height: number;
}

/** The text of one column row: name and declared type. */
export function columnLabel(table: SqlTableInfo, i: number): string {
  const type = table.types[i]?.toLowerCase();
  return type ? `${table.columns[i]}  ${type}` : table.columns[i]!;
}

/**
 * Places the tables in up to three columns, the most connected ones in the middle so the
 * lines stay short, and routes every foreign key whose table exists.
 */
export function layoutSchema(tables: SqlTableInfo[]): SchemaLayout {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const degree = new Map(tables.map((t) => [t.name, 0]));
  for (const t of tables)
    for (const r of t.refs)
      if (byName.has(r.table)) {
        degree.set(t.name, degree.get(t.name)! + 1);
        degree.set(r.table, degree.get(r.table)! + 1);
      }

  const size = (t: SqlTableInfo) => ({
    width: Math.ceil(PAD * 2 + 2 * CHAR + CHAR * Math.max(t.name.length, ...t.columns.map((_, i) => columnLabel(t, i).length))),
    height: HEADER + ROW * t.columns.length + 6,
  });

  const ncols = Math.min(3, tables.length);
  const middle = Math.floor(ncols / 2);
  const columns: SqlTableInfo[][] = Array.from({ length: ncols }, () => []);
  const heights = new Array<number>(ncols).fill(0);
  const total = tables.reduce((sum, t) => sum + size(t).height + GAP_Y, 0);
  // Most connected first (ties alphabetically); hubs fill the middle column up to its share, the rest go to the shortest column.
  const order = [...tables].sort((a, b) => degree.get(b.name)! - degree.get(a.name)! || a.name.localeCompare(b.name));
  for (const t of order) {
    const hub = degree.get(t.name)! > 0 && heights[middle]! < total / ncols;
    const col = hub ? middle : heights.indexOf(Math.min(...heights));
    columns[col]!.push(t);
    heights[col]! += size(t).height + GAP_Y;
  }

  const boxes: TableBox[] = [];
  let x = 0;
  for (const col of columns) {
    const width = Math.max(0, ...col.map((t) => size(t).width));
    let y = 0;
    for (const t of col) {
      const { height } = size(t);
      boxes.push({ table: t, x, y, width, height });
      y += height + GAP_Y;
    }
    x += width + GAP_X;
  }

  const boxOf = new Map(boxes.map((b) => [b.table.name, b]));
  const rowY = (b: TableBox, column: string) => b.y + HEADER + ROW * Math.max(0, b.table.columns.indexOf(column)) + ROW / 2;
  const links: Link[] = [];
  for (const a of boxes)
    for (const r of a.table.refs) {
      const b = boxOf.get(r.table);
      if (!b) continue;
      const to = r.to || b.table.pk[0] || b.table.columns[0]!;
      const y1 = rowY(a, r.from);
      const y2 = rowY(b, to);
      let path: string;
      if (a.x === b.x) {
        // Same column: out of the right edges and back in, bulging to the right.
        const x1 = a.x + a.width;
        const x2 = b.x + b.width;
        path = `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 + 40} ${y2}, ${x2} ${y2}`;
      } else {
        const right = b.x > a.x;
        const x1 = right ? a.x + a.width : a.x;
        const x2 = right ? b.x : b.x + b.width;
        const dx = (right ? 1 : -1) * Math.max(30, Math.abs(x2 - x1) / 2);
        path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      }
      links.push({ from: { table: a.table.name, column: r.from }, to: { table: b.table.name, column: to }, path });
    }

  const width = Math.max(0, ...boxes.map((b) => b.x + b.width)) + 44;
  const height = Math.max(0, ...boxes.map((b) => b.y + b.height));
  return { boxes, links, width, height };
}
