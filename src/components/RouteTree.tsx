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
 * Collapse duplicate chips where doing so cannot confuse.
 *
 * The prefix tree draws a part again whenever routes reach it along
 * different histories, and suffix merging only rejoins copies whose entire
 * continuation matches — so mål could sit beside mål, and a corridor chip
 * recur a row apart. Two same-part copies now merge whenever neither can
 * reach the other, which is exactly the condition under which the merged
 * picture stays an honest downward map: every edge is a real weld, so every
 * simple path through a merged chip is a real winning chain, and no cycle —
 * nothing needing arrows against the flow — can appear. Chips that routes
 * genuinely use in either order (liv→moder and moder→liv) fail that test
 * and stay duplicated, which is the clearer picture for them.
 */
function mergeDuplicates(nodes: DagNode[]): DagNode[] {
  const childSets = nodes.map((n) => new Set(n.children));
  const alias = nodes.map((n) => n.id);
  const find = (i: number): number => (alias[i] === i ? i : find(alias[i]!));

  const reaches = (from: number, to: number): boolean => {
    const seen = new Set<number>();
    const stack = [...childSets[from]!].map(find);
    while (stack.length) {
      const u = stack.pop()!;
      if (u === to) return true;
      if (seen.has(u)) continue;
      seen.add(u);
      for (const v of childSets[u]!) stack.push(find(v));
    }
    return false;
  };

  let merged = true;
  while (merged) {
    merged = false;
    const byPart = new Map<string, number[]>();
    for (const n of nodes) {
      const id = find(n.id);
      const list = byPart.get(n.part) ?? [];
      if (!list.includes(id)) list.push(id);
      byPart.set(n.part, list);
    }
    for (const copies of byPart.values()) {
      for (let i = 0; i < copies.length; i++) {
        for (let j = i + 1; j < copies.length; j++) {
          const a = find(copies[i]!);
          const b = find(copies[j]!);
          if (a === b || reaches(a, b) || reaches(b, a)) continue;
          for (const c of childSets[b]!) childSets[a]!.add(c);
          childSets[b] = new Set();
          alias[b] = a;
          merged = true;
        }
      }
    }
  }

  const live = nodes.filter((n) => find(n.id) === n.id);
  const remap = new Map(live.map((n, i) => [n.id, i]));
  const out: DagNode[] = live.map((n, i) => ({
    ...n,
    id: i,
    children: [...new Set([...childSets[n.id]!].map((c) => remap.get(find(c))!))],
    parents: [],
    y: 0,
  }));
  for (const n of out) {
    for (const c of n.children) out[c]!.parents.push(n.id);
  }
  // Re-layer: the trie's depths predate the merges.
  const depth = new Map<number, number>();
  const of = (n: DagNode): number => {
    const known = depth.get(n.id);
    if (known !== undefined) return known;
    depth.set(n.id, 0); // guard; the graph is acyclic by construction
    const d = n.parents.length ? Math.max(...n.parents.map((p) => of(out[p]!))) + 1 : 0;
    depth.set(n.id, d);
    return d;
  };
  for (const n of out) n.y = of(n);
  return out;
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
/** A map this many rows tall wraps into two columns, like text. */
const WRAP_MIN_ROWS = 9;
/** Space between the wrapped columns. */
const GUTTER = 34;

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

  const width = Math.max(...layers.map((l) => place(l)));
  return { width: width + PAD * 2, height: layers.length * ROW };
}

/** The DAG nodes a route walks, in order, excluding the start. */
function nodePath(nodes: DagNode[], day: Day, route: string[]): number[] {
  const ids: number[] = [];
  let node = nodes.find((n) => n.parents.length === 0)!;
  for (const part of [...route, day.target]) {
    node = nodes[node.children.find((c) => nodes[c]!.part === part)!]!;
    ids.push(node.id);
  }
  return ids;
}

/**
 * Wrap a tall map into two columns, the way text wraps.
 *
 * A deep day is a narrow strip many rows tall — most of the box it is shown
 * in goes unused, and no per-row compaction can fix that, because depth is
 * the route's own length. What can fix it is the same move a newspaper makes:
 * cut near the middle and continue alongside. The cut happens at a chip every
 * route passes through — the suffix-merged DAG guarantees no edge jumps past
 * such a chip, so each edge lands wholly in one column — and the chip is
 * drawn again, dashed, where the second column resumes.
 */
function wrap(nodes: DagNode[], day: Day, routes: string[][]) {
  const rows = Math.max(...nodes.map((n) => n.y)) + 1;
  if (rows < WRAP_MIN_ROWS) return null;

  let shared: Set<number> | null = null;
  for (const route of routes) {
    const ids = new Set(nodePath(nodes, day, route));
    const kept: number[] = shared ? [...shared].filter((i) => ids.has(i)) : [...ids];
    shared = new Set(kept);
  }
  const middle = (rows - 1) / 2;
  const cut = [...(shared ?? [])]
    .map((i) => nodes[i]!)
    .filter((n) => n.y >= 2 && n.y <= rows - 3)
    .sort((a, b) => Math.abs(a.y - middle) - Math.abs(b.y - middle))[0];
  if (!cut) return null;

  const first = nodes.filter((n) => n.y <= cut.y);
  const second = nodes.filter((n) => n.y > cut.y);
  const widthOf = (column: DagNode[]) =>
    Math.max(...column.map((n) => Math.abs(n.x) * 2 + n.width));
  const wFirst = widthOf(first);
  const wSecond = Math.max(widthOf(second), cut.width);
  const total = wFirst + GUTTER + wSecond;
  const dxFirst = -total / 2 + wFirst / 2;
  const dxSecond = total / 2 - wSecond / 2;
  for (const n of first) n.x += dxFirst;
  for (const n of second) {
    n.x += dxSecond;
    n.y -= cut.y;
  }
  return {
    width: total + PAD * 2,
    height: Math.max(cut.y + 1, rows - cut.y) * ROW,
    cut,
    copy: { x: dxSecond, y: 0 },
  };
}

/**
 * Every way the day could be won, drawn as one map: branching out from the
 * start, joining back wherever the rest of the way is shared, and funnelling
 * into the target. The route the player took runs through it in the accent.
 */
export function RouteTree({ day, mine, others }: Props) {
  // The map's height is the deepest drawn route, and a generous day's route
  // census includes eleven-link victory laps around a par-3 course. Those
  // wanderings are legal wins, not structure: the map draws routes near par
  // and says how many longer ways round it left out. The player's own route
  // is always drawn, however scenic.
  const nearPar = (route: string[]) => route.length + 1 <= day.par + 2;
  const shown = others.filter(nearPar);
  const hidden = others.length - shown.length;
  const routes = mine ? [mine, ...shown] : shown;
  const nodes = mergeDuplicates(buildDag(day, routes));
  const walked = mine ? markMine(nodes, day, mine) : new Set<string>();
  const laid = layout(nodes);
  const wrapped = wrap(nodes, day, routes);
  const { width, height } = wrapped ?? laid;

  const nodeY = (n: { y: number }) => n.y * ROW + ROW / 2;
  // Edges out of the cut chip leave from its dashed twin at the top of the
  // second column; edges into it arrive at the original, closing column one.
  const outOf = (n: DagNode) =>
    wrapped && n.id === wrapped.cut.id
      ? { x: wrapped.copy.x, y: wrapped.copy.y }
      : n;
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
          const a = outOf(from);
          const y1 = nodeY(a) + NODE_H / 2 + 1;
          const y2 = nodeY(to) - NODE_H / 2 - 1;
          const bend = Math.min(14, (y2 - y1) / 2);
          return (
            <path
              key={`${from.id}>${to.id}`}
              className="dag-edge"
              pathLength={1}
              d={`M ${a.x} ${y1} C ${a.x} ${y1 + bend}, ${to.x} ${y2 - bend}, ${to.x} ${y2}`}
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
      {hidden > 0 && (
        <p className="dag-note">
          … och {hidden} längre {hidden === 1 ? "omväg" : "omvägar"} som inte ritas.
        </p>
      )}
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
