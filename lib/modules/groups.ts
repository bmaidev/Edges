// The "groups & rounds" engine — the shared primitive behind World Café,
// Shift & Share, and 1-2-4-All. Pure, deterministic functions of (participant
// tokens, round, size): the same inputs always yield the same groups, so it is
// safe to call from computeView on every 2s poll with NO persistence and NO
// writes. Rotation by round changes membership each round, which keeps repeat
// co-occurrence low without needing a stored meet-matrix (a future refinement
// is a true Social-Golfer/meet-matrix optimiser; this stateless version is the
// robust v1).

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Stable, deterministic ordering of tokens (independent of join order).
export function sortedTokens(tokens: string[]): string[] {
  return [...tokens].sort();
}

// Round-robin (circle method) pairing: fix the first token, rotate the rest by
// `round`. Over n-1 rounds every pair meets exactly once. Odd counts leave one
// person unpaired that round (returned as a solo group of 1).
export function pairRound(tokens: string[], round: number): string[][] {
  const t = sortedTokens(tokens);
  if (t.length < 2) return t.map((x) => [x]);
  const line = [...t];
  const bye = line.length % 2 === 1;
  if (bye) line.push("__bye__");
  const n = line.length;
  const fixed = line[0];
  const rest = line.slice(1);
  const r = ((round % (n - 1)) + (n - 1)) % (n - 1);
  const rot = [...rest.slice(r), ...rest.slice(0, r)];
  const ordered = [fixed, ...rot];
  const pairs: string[][] = [];
  for (let i = 0; i < n / 2; i++) {
    const a = ordered[i];
    const b = ordered[n - 1 - i];
    const g = [a, b].filter((x) => x !== "__bye__");
    if (g.length) pairs.push(g);
  }
  return pairs;
}

// Group tokens into groups of `size`, rotated by `round` so membership changes
// each round. size<=1 → singletons; size===2 uses the circle method.
export function groupRound(
  tokens: string[],
  size: number,
  round: number,
): string[][] {
  const t = sortedTokens(tokens);
  if (t.length === 0) return [];
  if (size <= 1) return t.map((x) => [x]);
  if (size === 2) return pairRound(t, round);
  const n = t.length;
  const offset = ((round * size) % n + n) % n;
  const rotated = [...t.slice(offset), ...t.slice(0, offset)];
  return chunk(rotated, size);
}

// Locate a token's group + the group's index in the list.
export function groupOf(
  groups: string[][],
  token: string,
): { group: string[]; index: number } | null {
  for (let i = 0; i < groups.length; i++)
    if (groups[i].includes(token)) return { group: groups[i], index: i };
  return null;
}

// Which station/table an intact group visits this round (Shift & Share tour).
export function stationFor(
  groupIndex: number,
  round: number,
  numStations: number,
): number {
  if (numStations <= 0) return 0;
  return (groupIndex + round) % numStations;
}

// World Café: fixed tables; one persistent host per table (chosen at round 0),
// the rest of the room scatters across tables each round. Returns, for the
// given round, the membership of each table and its host token.
export function cafeRound(
  tokens: string[],
  numTables: number,
  round: number,
): { host: string | null; members: string[] }[] {
  const t = sortedTokens(tokens);
  const tables = Math.max(1, numTables);
  // Round-0 grouping fixes the hosts: host = first member of each round-0 group.
  const base = chunk(t, Math.ceil(t.length / tables));
  const hosts = base.map((g) => g[0] ?? null).filter((h): h is string => !!h);
  const hostSet = new Set(hosts);
  const travellers = t.filter((x) => !hostSet.has(x));
  // Scatter travellers across tables, rotated by round so they move each time.
  const out: { host: string | null; members: string[] }[] = hosts.map((h) => ({
    host: h,
    members: [h],
  }));
  if (out.length === 0) return [{ host: null, members: t }];
  travellers.forEach((tok, i) => {
    const table = (i + round) % out.length;
    out[table].members.push(tok);
  });
  return out;
}

// The doubling sizes for a 1-2-4-All progression, by round index.
export const ONE_TWO_FOUR_SIZES = [1, 2, 4, Infinity];
export function oneTwoFourSize(round: number): number {
  return ONE_TWO_FOUR_SIZES[Math.min(round, ONE_TWO_FOUR_SIZES.length - 1)];
}
