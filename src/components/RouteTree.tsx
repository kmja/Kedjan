import type { Day } from "../types";

interface Props {
  day: Day;
  /** The chain the player actually built, or null when the day was lost. */
  mine: string[] | null;
  /** Every other winning route. */
  others: string[][];
}

interface PartNode {
  id: number;
  part: string;
  /** Row index, assigned by layering. */
  y: number;
  mine: boolean;
  /** Neighbours in the layout orientation, for layering and untangling. */
  parents: number[];
  children: number[];
  x: number;
  width: number;
}

interface PartEdge {
  from: number;
  to: number;
  /** Reversed for layout: a real weld that runs against the drawing's flow. */
  back: boolean;
  mine: boolean;
}

/**
 * One node per part, edges drawn from the routes — the Sugiyama way, not the
 * unrolled way.
 *
 * An earlier version drew a prefix tree with merged suffixes, which
 * duplicated a part every time routes used the same chips in different
 * orders: liv and moder twice on neighbouring rows, mål beside mål. The
 * duplication bought a guarantee the game no longer needs. Any chain that
 * holds now wins, so every edge here is a real weld and every simple path
 * from start to target is a real winning chain — the graph of parts IS the
 * solution graph, and each part earns exactly one chip.
 *
 * Routes that use two chips in either order make the graph cyclic. The
 * standard treatment (greedy cycle removal, Eades–Lin–Smyth) picks a small
 * set of edges to treat as reversed during layering; they are drawn as
 * arrowed arcs against the flow, because they are real welds a player may
 * genuinely use.
 */
function buildGraph(day: Day, routes: string[][]) {
  const index = new Map<string, number>();
  const nodes: PartNode[] = [];
  const idOf = (part: string) => {
    let id = index.get(part);
    if (id === undefined) {
      id = nodes.length;
      index.set(part, id);
      nodes.push({ id, part, y: 0, mine: false, parents: [], children: [], x: 0, width: 0 });
    }
    return id;
  };

  const seen = new Set<string>();
  const edges: PartEdge[] = [];
  for (const route of routes) {
    const full = [day.start, ...route, day.target];
    for (let i = 0; i + 1 < full.length; i++) {
      const key = `${full[i]}>${full[i + 1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: idOf(full[i]!), to: idOf(full[i + 1]!), back: false, mine: false });
    }
  }
  return { nodes, edges };
}

/**
 * Greedy cycle removal: order the nodes so that few edges point backwards.
 * Sinks go to the tail, sources to the head, and ties break on outdegree
 * minus indegree — the Eades–Lin–Smyth heuristic, linear time and good
 * enough at this size to reverse only what genuinely tangles.
 */
function orderForLayout(nodes: PartNode[], edges: PartEdge[]): number[] {
  const outs = nodes.map(() => new Set<number>());
  const ins = nodes.map(() => new Set<number>());
  for (const e of edges) {
    outs[e.from]!.add(e.to);
    ins[e.to]!.add(e.from);
  }
  const alive = new Set(nodes.map((n) => n.id));
  const head: number[] = [];
  const tail: number[] = [];
  const drop = (id: number) => {
    alive.delete(id);
    for (const other of outs[id]!) ins[other]!.delete(id);
    for (const other of ins[id]!) outs[other]!.delete(id);
  };
  while (alive.size) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const id of [...alive]) {
        if (outs[id]!.size === 0) {
          tail.unshift(id);
          drop(id);
          moved = true;
        } else if (ins[id]!.size === 0) {
          head.push(id);
          drop(id);
          moved = true;
        }
      }
    }
    if (alive.size) {
      const pick = [...alive].reduce((a, b) =>
        outs[a]!.size - ins[a]!.size >= outs[b]!.size - ins[b]!.size ? a : b,
      );
      head.push(pick);
      drop(pick);
    }
  }
  const pos = nodes.map(() => 0);
  [...head, ...tail].forEach((id, i) => (pos[id] = i));
  return pos;
}

/**
 * Walk the player's own route and mark what it touches. An edge is theirs
 * only if they travelled it — a weld between two visited chips that they
 * never used is somebody else's road.
 */
function markMine(nodes: PartNode[], edges: PartEdge[], day: Day, mine: string[]) {
  const chain = [day.start, ...mine, day.target];
  const on = new Set(chain);
  for (const n of nodes) n.mine = on.has(n.part);
  const walked = new Set(chain.slice(0, -1).map((p, i) => `${p}>${chain[i + 1]}`));
  for (const e of edges) {
    e.mine = walked.has(`${nodes[e.from]!.part}>${nodes[e.to]!.part}`);
  }
}

/**
 * The map cannot lose rows — one per link of the deepest chain — so compact
 * means a tight pitch: chips of NODE_H with just enough line between rows to
 * read as a connection.
 */
const ROW = 46;
const NODE_H = 28;
const GAP = 10;
const PAD = 6;
/** How far a reversed weld's arc bows out beside the column. */
const BOW = 26;
/** A map this many rows tall wraps into two columns, like text. */
const WRAP_MIN_ROWS = 9;
/** Space between the wrapped columns. */
const GUTTER = 34;

/**
 * Layer on the cycle-removed orientation, then untangle. Longest-path
 * layering from the start; within a row, nodes chase the mean position of
 * their neighbours for a few sweeps — a small barycentre pass that resolves
 * most crossings at this size.
 */
function layout(nodes: PartNode[], edges: PartEdge[], day: Day) {
  for (const n of nodes) n.width = n.part.length * 8.4 + 26;

  const pos = orderForLayout(nodes, edges);
  for (const e of edges) e.back = pos[e.from]! > pos[e.to]!;
  for (const e of edges) {
    const [up, down] = e.back ? [e.to, e.from] : [e.from, e.to];
    nodes[up]!.children.push(down);
    nodes[down]!.parents.push(up);
  }

  // Longest path, in the layout order (a topological order of the forward
  // orientation). The start anchors the top; the target is pushed to the
  // bottom row even when cycle removal left it shallower.
  const byPos = [...nodes].sort((a, b) => pos[a.id]! - pos[b.id]!);
  for (const n of byPos) {
    n.y = n.part === day.start ? 0 : Math.max(1, ...n.parents.map((p) => nodes[p]!.y + 1));
  }
  const target = nodes.find((n) => n.part === day.target)!;
  const deepestOther = Math.max(
    ...nodes.filter((n) => n !== target).map((n) => n.y),
  );
  if (target.y <= deepestOther) target.y = deepestOther + 1;

  const byRank: PartNode[][] = [];
  for (const n of nodes) (byRank[n.y] ??= []).push(n);
  const layers = byRank.filter((l) => l !== undefined);
  layers.forEach((layer, rank) => {
    for (const n of layer) n.y = rank;
  });

  const place = (layer: PartNode[]) => {
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

  const width = Math.max(...layers.map((l) => place(l)));
  return { width: width + PAD * 2 + BOW, height: layers.length * ROW };
}

/**
 * Wrap a tall map into two columns, the way text wraps.
 *
 * A deep day is a narrow strip many rows tall — most of the box it is shown
 * in goes unused, and no per-row compaction can fix that, because depth is
 * the route's own length. So past WRAP_MIN_ROWS the map cuts at a chip every
 * route passes through and continues alongside, the cut chip drawn again,
 * dashed, where the second column resumes. Only a cut no edge jumps across
 * qualifies, so each edge lands wholly in one column.
 */
function wrap(nodes: PartNode[], edges: PartEdge[], routes: string[][]) {
  const rows = Math.max(...nodes.map((n) => n.y)) + 1;
  if (rows < WRAP_MIN_ROWS) return null;

  let shared: Set<string> | null = null;
  for (const route of routes) {
    const parts = new Set(route);
    const kept: string[] = shared ? [...shared].filter((p) => parts.has(p)) : [...parts];
    shared = new Set(kept);
  }
  const spansAcross = (row: number) =>
    edges.some((e) => {
      const lo = Math.min(nodes[e.from]!.y, nodes[e.to]!.y);
      const hi = Math.max(nodes[e.from]!.y, nodes[e.to]!.y);
      return lo < row && row < hi;
    });
  const middle = (rows - 1) / 2;
  const cut = [...(shared ?? [])]
    .map((p) => nodes.find((n) => n.part === p)!)
    .filter((n) => n.y >= 2 && n.y <= rows - 3 && !spansAcross(n.y))
    .sort((a, b) => Math.abs(a.y - middle) - Math.abs(b.y - middle))[0];
  if (!cut) return null;

  const first = nodes.filter((n) => n.y <= cut.y);
  const second = nodes.filter((n) => n.y > cut.y);
  const widthOf = (column: PartNode[]) =>
    Math.max(...column.map((n) => Math.abs(n.x) * 2 + n.width));
  const wFirst = widthOf(first) + BOW;
  const wSecond = Math.max(widthOf(second), cut.width) + BOW;
  const total = wFirst + GUTTER + wSecond;
  const dxFirst = -total / 2 + wFirst / 2;
  const dxSecond = total / 2 - wSecond / 2;
  for (const n of first) n.x += dxFirst;
  const inSecond = new Set<number>();
  for (const n of second) {
    n.x += dxSecond;
    n.y -= cut.y;
    inSecond.add(n.id);
  }
  return {
    width: total + PAD * 2,
    height: Math.max(cut.y + 1, rows - cut.y) * ROW,
    cut,
    inSecond,
    copy: { x: dxSecond, y: 0 },
  };
}

/**
 * Every way the day could be won, drawn as one map: each part exactly once,
 * welds branching out from the start and funnelling into the target, the
 * player's route running through it in the accent. Welds that run against
 * the drawing's flow — the same chips usable in the other order — bow out
 * beside the column, arrowed.
 */
export function RouteTree({ day, mine, others }: Props) {
  const routes = mine ? [mine, ...others] : others;
  const { nodes, edges } = buildGraph(day, routes);
  if (mine) markMine(nodes, edges, day, mine);
  const laid = layout(nodes, edges, day);
  const wrapped = wrap(nodes, edges, routes);
  const { width, height } = wrapped ?? laid;

  const nodeY = (n: { y: number }) => n.y * ROW + ROW / 2;
  // Around the cut, an edge endpoint that IS the cut chip renders at the
  // dashed twin whenever the edge's other end lives in the second column.
  const at = (end: PartNode, other: PartNode) =>
    wrapped && end.id === wrapped.cut.id && wrapped.inSecond.has(other.id)
      ? { x: wrapped.copy.x, y: wrapped.copy.y, width: end.width }
      : end;
  const drawn = edges.map((e) => {
    const from = nodes[e.from]!;
    const to = nodes[e.to]!;
    return { ...e, a: at(from, to), b: at(to, from) };
  });
  // The player's edges last, so a join they passed through stays visible.
  drawn.sort((a, b) => Number(a.mine) - Number(b.mine));

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
        <defs>
          <marker id="dag-arrow" viewBox="0 0 8 8" refX="6.5" refY="4"
                  markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--edge)" />
          </marker>
          <marker id="dag-arrow-mine" viewBox="0 0 8 8" refX="6.5" refY="4"
                  markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--falu)" />
          </marker>
        </defs>
        {drawn.map(({ a, b, back, mine: onMine, from, to }) => {
          let d: string;
          if (!back && b.y > a.y) {
            const y1 = nodeY(a) + NODE_H / 2 + 1;
            const y2 = nodeY(b) - NODE_H / 2 - 1;
            const bend = Math.min(14, (y2 - y1) / 2);
            d = `M ${a.x} ${y1} C ${a.x} ${y1 + bend}, ${b.x} ${y2 - bend}, ${b.x} ${y2}`;
          } else {
            // A weld against the flow: out of the chip's side, bowing past
            // the column's edge, arrowing into its goal from the side.
            const side = (a.x + b.x) / 2 >= 0 ? 1 : -1;
            const x1 = a.x + side * (a.width / 2 + 1);
            const x2 = b.x + side * (b.width / 2 + 2);
            const bow = side * (Math.max(side * x1, side * x2) + BOW);
            d = `M ${x1} ${nodeY(a)} C ${bow} ${nodeY(a)}, ${bow} ${nodeY(b)}, ${x2} ${nodeY(b)}`;
          }
          return (
            <path
              key={`${from}>${to}`}
              className="dag-edge"
              pathLength={1}
              d={d}
              fill="none"
              stroke={onMine ? "var(--falu)" : "var(--edge)"}
              strokeWidth={onMine ? 3.5 : 2}
              markerEnd={back ? `url(#dag-arrow${onMine ? "-mine" : ""})` : undefined}
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
        {wrapped && (
          // The cut chip again, dashed, where the second column resumes —
          // the same word twice says "continues here" without an arrow.
          <g>
            <rect
              x={wrapped.copy.x - wrapped.cut.width / 2}
              y={nodeY(wrapped.copy) - NODE_H / 2}
              width={wrapped.cut.width}
              height={NODE_H}
              rx={8}
              fill="var(--panel)"
              stroke={wrapped.cut.mine ? "var(--falu)" : "var(--edge)"}
              strokeWidth={wrapped.cut.mine ? 3 : 1.5}
              strokeDasharray="5 4"
            />
            <text
              x={wrapped.copy.x}
              y={nodeY(wrapped.copy) + 4.5}
              textAnchor="middle"
              className="dag-part"
              data-mine={wrapped.cut.mine || undefined}
              fill={wrapped.cut.mine ? "var(--falu-ink)" : "var(--ink)"}
            >
              {wrapped.cut.part}
            </text>
          </g>
        )}
      </svg>
      {/* The same routes as plain text, for screen readers — an SVG map is a
          picture, and the picture is not the only way to read it. */}
      <ul className="sr-only">
        {routes.map((route) => (
          <li key={route.join(">")}>
            {[day.start, ...route, day.target].join(", ")}
            {route === mine ? " — din väg" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
