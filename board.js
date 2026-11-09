/**
 * The staff ranking board, rendered in the browser.
 *
 * This lives on the page's own host rather than in the edge function because Supabase
 * rewrites any GET declaring a renderable document type to text/plain on *.supabase.co —
 * measured, not assumed: text/html, text/html;charset=utf-8 and application/xhtml+xml all
 * came back as text/plain. So the function serves JSON and this renders it.
 *
 * RANKING LIVES HERE, not in the function, because every number column is its own
 * ranking and the reader chooses between them by pressing a column header. A rank
 * computed on the server would be one answer to a question the reader has not asked yet.
 *
 * Plain JavaScript with no build step and no dependencies, imported as a module by both
 * index.html and the Deno test suite, so the behaviour the tests pin is the behaviour the
 * browser runs — not a second copy of it.
 */

const h = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const num = (n) => Number(n).toLocaleString("en-MY");
const rate = (n) => n === null || n === undefined ? "—" : Number(n).toFixed(2);

/** Where a rating sits, for colour. Not a verdict on the branch — a place to look. */
export function band(r) {
  if (r === null || r === undefined) return "";
  if (r >= 4.7) return "s";
  if (r >= 4.3) return "m";
  return "w";
}

const medal = (rank) => rank && rank <= 3 ? ` r${rank}` : "";

export const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** 09 Nov, 16:10 — the only timezone every branch is in. */
export function myt(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

/**
 * Joins several businesses' boards into one page.
 *
 * Safe because every ranking is computed inside a single group and never across groups:
 * concatenating two businesses cannot move anybody. The stalest generatedAt wins, so the
 * page never claims to be fresher than its oldest half. A feed that failed to load is
 * passed in as null and simply contributes no groups.
 */
export function mergeBoards(boards) {
  const live = boards.filter(Boolean);
  if (!live.length) return null;
  const groups = live.flatMap((b) => b.groups)
    .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
  // Every feed was asked for the same window, so the first live one names it.
  return {
    groups,
    generatedAt: live.map((b) => b.generatedAt).sort()[0],
    from: live[0].from,
    to: live[0].to,
  };
}

/**
 * The four rankings, one per number column.
 *
 * Each returns the tuple a branch is ordered by, largest first, or null when there is
 * nothing to rank — no live reviews, or none inside the 24-hour window. Null means the
 * branch shows a dash and sits below every ranked one, rather than being handed last
 * place in a race it was not in.
 *
 * Every one carries a tie-breaker, because ties are the common case rather than the edge
 * case: on a quiet morning six branches sit on one new review each, and separating them
 * by accident of array order would be a board that invents a result.
 */
export const SORTS = {
  rating: (b) => b.total > 0 && b.rating != null ? [b.rating, b.total] : null,
  total: (b) => b.total > 0 ? [b.total, b.rating ?? 0] : null,
  period: (b) => b.periodCount > 0 ? [b.periodCount, b.periodRating ?? 0] : null,
  periodRating: (b) =>
    b.periodCount > 0 && b.periodRating != null ? [b.periodRating, b.periodCount] : null,
};

export const DEFAULT_SORT = "rating";

/** Larger first, tuple by tuple. */
function cmpDesc(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Branches in the order this column ranks them, each carrying its rank.
 *
 * Competition ranking: branches whose whole tuple matches share a rank, and the next
 * rank skips the tie. Unranked branches follow, ordered by review count, so the list
 * under the contest is still stable and readable.
 */
export function rankBranches(branches, sort) {
  const key = SORTS[sort] ?? SORTS[DEFAULT_SORT];
  const out = [];

  let prev = null;
  let rank = 0;
  branches.filter((b) => key(b) !== null)
    .sort((x, y) => cmpDesc(key(x), key(y)))
    .forEach((b, i) => {
      const k = key(b);
      if (prev === null || cmpDesc(prev, k) !== 0) rank = i + 1;
      out.push({ branch: b, rank });
      prev = k;
    });

  for (
    const b of branches.filter((x) => key(x) === null)
      .sort((x, y) => y.total - x.total || x.label.localeCompare(y.label))
  ) out.push({ branch: b, rank: null });

  return out;
}

/**
 * The column headers ARE the control: pressing one re-ranks every group by it.
 *
 * The last two are named after whichever period is selected, so a reader ranking by
 * "7 days" is looking at a column that says 7 days rather than one still saying 24h.
 */
export function columns(periodLabel) {
  return [
    { sort: "rating", label: "Rating" },
    { sort: "total", label: "Reviews" },
    { sort: "period", label: periodLabel },
    { sort: "periodRating", label: `${periodLabel} ★`, cls: "sm" },
  ];
}

function row({ branch: b, rank }) {
  return `<tr>` +
    `<td class="rk${medal(rank)}">${rank ?? "—"}</td>` +
    `<td class="br">${h(b.label)}</td>` +
    `<td class="n c-rating ${band(b.rating)}">${rate(b.rating)}</td>` +
    `<td class="n c-total mut">${num(b.total)}</td>` +
    `<td class="n c-period">${b.periodCount || "—"}</td>` +
    `<td class="n c-periodRating sm ${band(b.periodRating)}">${rate(b.periodRating)}</td>` +
    `</tr>`;
}

export function groupSection(g, sort, periodLabel) {
  const n = g.branches.length;
  const heads = columns(periodLabel).map((c) =>
    `<th class="n c-${c.sort} ${c.cls ?? ""}">` +
    `<button class="sb" data-sort="${c.sort}">${c.label}</button></th>`
  ).join("");
  return `<section id="g-${slug(g.name)}">
<h2>${h(g.name)}</h2>
<p class="sum">${n} ${n === 1 ? "branch" : "branches"} · ${num(g.total)} reviews · ${
    rate(g.rating)
  }★ · ${g.periodCount} new in ${periodLabel}</p>
<div class="tw"><table>
<thead><tr><th class="rk">#</th><th class="br">Branch</th>${heads}</tr></thead>
<tbody>${rankBranches(g.branches, sort).map(row).join("")}</tbody>
</table></div>
</section>`;
}

export function renderChips(board) {
  return board.groups
    .map((g) => `<a href="#g-${slug(g.name)}">${h(g.name)}</a>`)
    .join("");
}

export function renderMain(board, sort, periodLabel) {
  return board.groups.map((g) => groupSection(g, sort, periodLabel)).join("");
}

/**
 * The presets, and what each one asks the feed for.
 *
 * Boundaries are computed here rather than on the server because only this side knows
 * what a date means to the person who picked it: a custom range is Malaysian calendar
 * days, which start at 16:00 UTC the day before. The rolling windows are rounded down to
 * the minute so that reloading inside a minute reuses the feed's cache instead of
 * asking for a window one millisecond different from the last one.
 */
export const PERIODS = {
  "24h": { label: "24h", days: 1 },
  "7d": { label: "7 days", days: 7 },
  "30d": { label: "30 days", days: 30 },
};

const MIN_MS = 60_000;

export function rollingWindow(days, now = Date.now()) {
  const to = Math.floor(now / MIN_MS) * MIN_MS;
  return { from: new Date(to - days * 86_400_000).toISOString(), to: new Date(to).toISOString() };
}

/**
 * A pair of yyyy-mm-dd dates as Malaysian calendar days, END INCLUSIVE.
 *
 * Someone picking 1 Nov to 9 Nov means the 9th as well, so the upper bound is the
 * following midnight — the query is `>= from and < to`. Taking the dates at face value
 * would quietly drop the last day, and the board would be wrong by exactly one day in a
 * way nobody would notice.
 *
 * +08:00 and not UTC: a Malaysian day starts at 16:00 the previous day in UTC, so
 * treating these as UTC midnights would shift every range by eight hours.
 */
export function customWindow(fromDate, toDate) {
  const end = new Date(`${toDate}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { from: new Date(`${fromDate}T00:00:00+08:00`).toISOString(), to: end.toISOString() };
}

/** "1 Nov - 9 Nov", for a hand-picked range. */
export function customLabel(fromDate, toDate) {
  const f = (d) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
      .format(new Date(`${d}T00:00:00Z`));
  return fromDate === toDate ? f(fromDate) : `${f(fromDate)}\u2013${f(toDate)}`;
}
