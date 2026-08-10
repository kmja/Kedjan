/**
 * The missing-word counter.
 *
 * POST {pair: "sten+mur", day} — one vote that the pair should have welded.
 * GET — the review list: every reported pair with its count, and the ones
 * past the threshold pulled out under `flagged`. That list is the queue a
 * curator works through; a pair with ten votes is worth a dictionary check
 * whatever the lint thought of it.
 *
 * Counts live in a Vercel KV / Upstash Redis store, reached over its REST
 * API so this stays dependency-free. Without the store configured the
 * endpoint answers politely and stores nothing — reporting must never
 * error at the player, whose tap already counted for them locally.
 */

const FLAG_AT = 10;
//: A pair is two lowercase word-parts. Anything else is not a report.
const PAIR = /^[a-zà-öø-ÿ]{1,24}\+[a-zà-öø-ÿ]{1,24}$/u;

const BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function kv(...command) {
  const resp = await fetch(`${BASE}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!resp.ok) throw new Error(`kv answered ${resp.status}`);
  return (await resp.json()).result;
}

export default async function handler(req, res) {
  if (!BASE || !TOKEN) {
    res.status(200).json({ stored: false, note: "no store configured" });
    return;
  }

  if (req.method === "POST") {
    const pair = String((req.body && req.body.pair) || "");
    if (!PAIR.test(pair)) {
      res.status(400).json({ error: "not a pair" });
      return;
    }
    const count = await kv("INCR", `report:${pair}`);
    await kv("SADD", "reported", pair);
    res.status(200).json({ stored: true, pair, count, flagged: count >= FLAG_AT });
    return;
  }

  const pairs = (await kv("SMEMBERS", "reported")) || [];
  const counts = {};
  if (pairs.length) {
    const values = await kv("MGET", ...pairs.map((p) => `report:${p}`));
    pairs.forEach((p, i) => {
      counts[p] = Number(values[i]) || 0;
    });
  }
  const flagged = Object.entries(counts)
    .filter(([, n]) => n >= FLAG_AT)
    .sort(([, x], [, y]) => y - x)
    .map(([pair, count]) => ({ pair, count }));
  res.status(200).json({ threshold: FLAG_AT, flagged, counts });
}
