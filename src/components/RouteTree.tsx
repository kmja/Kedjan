import type { Day } from "../types";

interface Props {
  day: Day;
  /** The chain the player actually built. */
  mine: string[];
  /** Every other winning route. */
  others: string[][];
}

interface TrieNode {
  part: string;
  onMine: boolean;
  children: TrieNode[];
}

/**
 * Merge routes into a prefix tree. A flat list of routes hides their real
 * shape — lön+skatt carries five of eight routes on one day — and the tree is
 * that shape: where the ways to win diverge, and where they run together.
 */
function buildTrie(day: Day, routes: string[][], mineKey: string): TrieNode {
  const root: TrieNode = { part: day.start, onMine: true, children: [] };
  for (const route of routes) {
    const isMine = route.join(">") === mineKey;
    let node = root;
    for (const part of [...route, day.target]) {
      let next = node.children.find((c) => c.part === part);
      if (!next) {
        next = { part, onMine: false, children: [] };
        node.children.push(next);
      }
      next.onMine ||= isMine;
      node = next;
    }
  }
  sortBranches(root);
  return root;
}

/** Shorter ways to the target first, then alphabetically — stable to read. */
function sortBranches(node: TrieNode): number {
  const depths = node.children.map(sortBranches);
  const byChild = new Map(node.children.map((c, i) => [c, depths[i]!]));
  node.children.sort(
    (a, b) => byChild.get(a)! - byChild.get(b)! || a.part.localeCompare(b.part, "sv"),
  );
  return 1 + Math.min(...depths, 0);
}

function Branch({ node, day }: { node: TrieNode; day: Day }) {
  const endpoint = node.part === day.start || node.part === day.target;
  return (
    <li>
      <span
        className={`tree-part ${endpoint ? "tree-part--endpoint" : ""} ${
          node.onMine ? "tree-part--mine" : ""
        }`}
      >
        {node.part}
        {node.onMine && node.part === day.target && (
          <span className="sr-only"> — din väg</span>
        )}
      </span>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <Branch key={child.part} node={child} day={day} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * All the ways the day could be won, as one branching tree from start to
 * target, with the route the player took picked out in green.
 */
export function RouteTree({ day, mine, others }: Props) {
  const root = buildTrie(day, [mine, ...others], mine.join(">"));
  return (
    <div aria-label="Alla vägar till målet, som ett träd">
      <ul className="tree">
        <Branch node={root} day={day} />
      </ul>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
        Din väg i grönt. Varje gren slutar i {day.target.toUpperCase()}.
      </p>
    </div>
  );
}
