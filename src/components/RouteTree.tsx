import type { Day } from "../types";

interface Props {
  day: Day;
  /** The chain the player actually built, or null when the day was lost. */
  mine: string[] | null;
  /** Every other winning route. */
  others: string[][];
}

interface DagNode {
  id: number;
  part: string;
  /** Layer: the longest distance from the start. */
  y: number;
  mine: boolean;
  children: number[];
  parents: number[];
  x: number;
  width: number;
}

interface TrieNode {
  part: string;
  depth: number;
  children: Map<string, TrieNode>;
}

/**
 * Merge the routes into a DAG that branches out and joins back.
 *
 * First a prefix tree, so routes diverge where the choices did. Then suffix
 * merging: two nodes collapse into one exactly when they carry the same part
 * and their entire continuation is identical. That rule is what makes the
 * joins safe — any path through a merged node is some real route's prefix
 * glued to some real route's suffix through that node, and because the
 * suffixes are identical both halves came from real routes. Nothing the
 * picture shows is a way to win that does not exist.
 *
 * The target always merges to a single node (every leaf carries the same part
 * and an empty continuation), so every branch funnels back into it.
 */
function buildDag(day: Day, routes: string[][]): DagNode[] {
  const root: TrieNode = { part: day.start, depth: 0, children: new Map() };
  for (const route of routes) {
    let node = root;
    for (const part of [...route, day.target]) {
      let next = node.children.get(part);
      if (!next) {
        next = { part, depth: node.depth + 1, children: new Map() };
        node.children.set(part, next);
      }
      node = next;
    }
  }

  const nodes: DagNode[] = [];
  const bySignature = new Map<string, number>();

  const merge = (t: TrieNode): number => {
    const childIds = [...t.children.values()].map(merge).sort((a, b) => a - b);
    const signature = `${t.part}|${childIds.join(",")}`;
    const known = bySignature.get(signature);
    if (known !== undefined) {
      const node = nodes[known]!;
      node.y = Math.max(node.y, t.depth);
      return known;
    }
    const id = nodes.length;
    nodes.push({
      id,
      part: t.part,
      y: t.depth,
      mine: false,
      children: childIds,
      parents: [],
      x: 0,
      width: 0,
    });
    bySignature.set(signature, id);
    return id;
  };
  merge(root);

  for (const node of nodes) {
    for (const child of node.children) nodes[child]!.parents.push(node.id);
  }
  return nodes;
}

/**
 * Walk the player's own route through the DAG and mark what it touches.
 * Returns the edges of the walk itself: an edge is theirs only if they
 * travelled it, not merely because both its ends lie on their route — a
 * shortcut between two visited nodes is somebody else's road.
 */
function markMine(nodes: DagNode[], day: Day, mine: string[]): Set<string> {
  const walked = new Set<string>();
  let node = nodes.find((n) => n.parents.length === 0)!;
  node.mine = true;
  for (const part of [...mine, day.target]) {
    const next = nodes[node.children.find((c) => nodes[c]!.part === part)!]!;
    walked.add(`${node.id}>${next.id}`);
    next.mine = true;
    node = next;
  }
  return walked;
}

/**
 * The map cannot lose layers — one per link of the longest route — so compact
 * means a tight pitch: chips of NODE_H with just enough line between rows to
 * read as a connection. A long day already fills a phone screen; every empty
 * pixel per row multiplies by the route length.
 */
const ROW = 46;
const NODE_H = 28;
const GAP = 10;
const PAD = 6;
/** Chips inside a folded corridor sit further apart, so the link reads. */
const RUN_GAP = 18;
/** A folded corridor may not grow wider than the map is allowed to be. */
const MAX_RUN_WIDTH = 330;

/**
 * Position the layers. Suffix merging guarantees every child sits on a lower
 * layer than its parent, so layers are simply the y-ranks. Within a layer,
 * nodes chase the mean position of their neighbours for a few sweeps — a
 * small barycentre pass that untangles most crossings at this size.
 */
function layout(nodes: DagNode[]): { width: number; height: number } {
  for (const n of nodes) n.width = n.part.length * 8.4 + 26;

  const byRank: DagNode[][] = [];
  for (const n of nodes) (byRank[n.y] ??= []).push(n);
  // Merging pulls nodes down to their deepest occurrence, which can leave a
  // rank with nothing on it. Close the gap: renumbering ranks consecutively
  // keeps every child below its parent while dropping the blank rows.
  const layers = byRank.filter((l) => l !== undefined);
  layers.forEach((layer, rank) => {
    for (const n of layer) n.y = rank;
  });

  const place = (layer: DagNode[]) => {
    const total = layer.reduce((w, n) => w + n.width, 0) + GAP * (layer.length - 1);
    let x = -total / 2;
    for (const n of layer) {
      n.x = x + n.width / 2;
      x += n.width + GAP;
    }
    return total;
  };
  layers.forEach(place);

  const mean = (ids: number[], fallback: number) =>
    ids.length ? ids.reduce((s, i) => s + nodes[i]!.x, 0) / ids.length : fallback;
  for (let pass = 0; pass < 3; pass++) {
    for (const layer of [...layers.slice(1), ...layers.slice(0, -1).reverse()]) {
      layer.sort(
        (a, b) =>
          mean([...a.parents, ...a.children], a.x) -
          mean([...b.parents, ...b.children], b.x),
      );
      place(layer);
    }
  }

  // Fold corridors. A run of layers holding one node each, chained parent to
  // child, is a shared stretch every route walks — and one row per node
  // spends a screenful on what reads as a single line. Lay it out
  // horizontally instead: left to right is the flow's direction as much as
  // downward is. The start and target stay on rows of their own — they
  // anchor the map — and a run folds only as far as the width allows.
  const rows: DagNode[][] = [];
  const chainable: boolean[] = [];
  const span = (row: DagNode[], gap: number) =>
    row.reduce((w, n) => w + n.width, 0) + gap * (row.length - 1);
  for (const layer of layers) {
    const solo = layer.length === 1 ? layer[0]! : null;
    const prev = rows[rows.length - 1];
    const last = prev?.[prev.length - 1];
    if (
      solo &&
      last &&
      chainable[rows.length - 1] &&
      last.children.length === 1 &&
      last.children[0] === solo.id &&
      solo.parents.length === 1 &&
      last.parents.length > 0 &&
      solo.children.length > 0 &&
      span([...prev!, solo], RUN_GAP) <= MAX_RUN_WIDTH
    ) {
      prev!.push(solo);
    } else {
      rows.push([...layer]);
      chainable.push(solo !== null);
    }
  }

  const placeRun = (row: DagNode[]) => {
    const total = span(row, RUN_GAP);
    let x = -total / 2;
    for (const n of row) {
      n.x = x + n.width / 2;
      x += n.width + RUN_GAP;
    }
    return total;
  };
  const width = Math.max(
    ...rows.map((row, r) => {
      for (const n of row) n.y = r;
      return row.length > 1 && chainable[r] ? placeRun(row) : place(row);
    }),
  );
  return { width: width + PAD * 2, height: rows.length * ROW };
}

/**
 * Every way the day could be won, drawn as one map: branching out from the
 * start, joining back wherever the rest of the way is shared, and funnelling
 * into the target. The route the player took runs through it in the accent.
 */
export function RouteTree({ day, mine, others }: Props) {
  const nodes = buildDag(day, mine ? [mine, ...others] : others);
  const walked = mine ? markMine(nodes, day, mine) : new Set<string>();
  const { width, height } = layout(nodes);

  const nodeY = (n: DagNode) => n.y * ROW + ROW / 2;
  const edges = nodes.flatMap((from) =>
    from.children.map((c) => {
      const to = nodes[c]!;
      return { from, to, mine: walked.has(`${from.id}>${to.id}`) };
    }),
  );
  // Green edges last, so a join the player passed through stays visibly green.
  edges.sort((a, b) => Number(a.mine) - Number(b.mine));

  return (
    <div aria-label="Alla vägar till målet, som ett träd">
      <svg
        viewBox={`${-width / 2} 0 ${width} ${height}`}
        role="img"
        aria-label={`Karta över alla vägar från ${day.start} till ${day.target}. Din väg är markerad.`}
        style={{
          width: "100%",
          // The coordinate system is drawn at chip scale, so natural size is
          // the ceiling: a wide map shrinks to fit, a narrow one must not
          // balloon its chips past the size they have on the board.
          maxWidth: width,
          height: "auto",
          display: "block",
          margin: "0 auto",
        }}
      >
        {edges.map(({ from, to, mine: onMine }) => {
          // Inside a folded corridor the flow runs left to right: a short
          // straight link from chip edge to chip edge, on the row's midline.
          const d =
            from.y === to.y
              ? `M ${from.x + from.width / 2 + 1} ${nodeY(from)} L ${to.x - to.width / 2 - 1} ${nodeY(to)}`
              : (() => {
                  const y1 = nodeY(from) + NODE_H / 2 + 1;
                  const y2 = nodeY(to) - NODE_H / 2 - 1;
                  const bend = Math.min(14, (y2 - y1) / 2);
                  return `M ${from.x} ${y1} C ${from.x} ${y1 + bend}, ${to.x} ${y2 - bend}, ${to.x} ${y2}`;
                })();
          return (
            <path
              key={`${from.id}>${to.id}`}
              className="dag-edge"
              pathLength={1}
              d={d}
              fill="none"
              stroke={onMine ? "var(--falu)" : "var(--edge)"}
              strokeWidth={onMine ? 3.5 : 2}
            />
          );
        })}
        {nodes.map((n) => {
          const endpoint = n.part === day.start || n.part === day.target;
          const w = n.width;
          return (
            <g key={n.id}>
              <rect
                x={n.x - w / 2}
                y={nodeY(n) - NODE_H / 2}
                width={w}
                height={NODE_H}
                rx={8}
                fill={endpoint ? "var(--falu)" : "var(--panel)"}
                stroke={n.mine ? "var(--falu)" : endpoint ? "var(--falu-deep)" : "var(--edge)"}
                strokeWidth={n.mine ? 3 : 1.5}
              />
              <text
                x={n.x}
                y={nodeY(n) + 4.5}
                textAnchor="middle"
                className="dag-part"
                data-mine={n.mine || undefined}
                fill={endpoint ? "var(--on-falu)" : n.mine ? "var(--falu-ink)" : "var(--ink)"}
              >
                {n.part}
              </text>
            </g>
          );
        })}
      </svg>
      {/* The same routes as plain text, for screen readers — an SVG map is a
          picture, and the picture is not the only way to read it. */}
      <ul className="sr-only">
        {(mine ? [mine, ...others] : others).map((route) => (
          <li key={route.join(">")}>
            {[day.start, ...route, day.target].join(", ")}
            {route === mine ? " — din väg" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
