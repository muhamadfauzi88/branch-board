# Branch ranking board

A single page that ranks branches inside their own group, over a period you choose.

Press a column header to rank by it: all-time rating, all-time review count, how many
arrived in the period, or the average rating of those. Pick the period from 24 hours,
7 days, 30 days, or any pair of dates.

## It holds nothing

No keys, no project ids, no names. Everything arrives in the URL:

```
https://<this-site>/?s1=<project>&k1=<key>&s2=<project>&k2=<key>
```

Each key authorises exactly one source, and no source is given any way to reach another.
A wrong or missing key gets a 404 from that source. Up to four sources are read; a source
that cannot be reached is noted in one line and the rest of the board still draws.

Optional: `&p=7d` (or `24h`, `30d`, or `custom` with `&from=`/`&to=`) and `&sort=rating`
(or `total`, `period`, `periodRating`). The page writes both back as you use it, so a
bookmarked link reopens exactly where you left it.

## Where the data comes from

Each source is a small JSON endpoint returning, per branch: a label, its all-time review
count and rating, and the same two inside the requested window. The ranking is done here,
in `board.js`, which is also imported by the server's test suite — so the behaviour the
tests pin is the behaviour this page runs, not a second copy of it.
