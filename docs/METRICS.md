# MyScene — Metrics (privacy-friendly analytics)

MyScene has exactly one analytics system: a small self-hosted event counter
(EXP-002). No third-party trackers, no fingerprinting, no cross-site
tracking. This document is the spec — the code in `api/db/track_event.php`
and `public/js/track.js` is the enforcement.

## What is collected

One row per event in the `AnalyticsEvents` table
(`migrations/002_analytics_events.sql`):

| column       | type        | notes                                        |
| ------------ | ----------- | -------------------------------------------- |
| `page`       | VARCHAR(20) | which page fired the event (allowlisted)     |
| `event`      | VARCHAR(30) | what happened (allowlisted)                  |
| `detail`     | VARCHAR(60) | optional context (see formats below)         |
| `created_at` | TIMESTAMP   | server time, `NOW()` at insert               |

**What is never stored:** IP address, user agent, cookies, device
identifiers, or any PII. The browser sends a single small JSON beacon per
event (`navigator.sendBeacon` with a `fetch` fallback, `keepalive`);
beacons are fire-and-forget — analytics must never block or break a page.

## Allowlists (enforced server-side in `api/db/track_event.php`)

Anything outside these lists is rejected with a 400 before it touches the
database.

- **Pages:** `index`, `viewArtist`, `addArtist`, `login`, `register`,
  `analytics`, `shows`
- **Events:** `pageview`, `search_run`, `search_success`, `profile_view`,
  `insta_click`, `offline_notice_shown`, `fav_toggle`, `event_add`

## `detail` formats

| event              | detail format                          | example                        |
| ------------------ | -------------------------------------- | ------------------------------ |
| `profile_view`     | `artist:{name}`                        | `artist:Burn Absolute`         |
| `insta_click`      | `artist:{name}`                        | `artist:Burn Absolute`         |
| `fav_toggle`       | `artist:{name}`                        | `artist:Burn Absolute`         |
| `event_add`        | `artist:{name}`                        | `artist:Burn Absolute`         |
| `search_success`   | `genre:{genres}\|results:{n}`          | `genre:Rock\|results:5`        |
| `search_run`       | *(none)*                               |                                |
| `pageview`         | *(none)*                               |                                |
| `offline_notice_shown` | *(none)*                           |                                |

Multi-genre searches join the genres with a comma:
`genre:Rock,Punk|results:7`. Legacy `search_success` rows written before
Batch 3 carry only `results:{n}`; they still count toward the totals but
not toward the genre ranking.

## Volume estimate

At current traffic the table grows by roughly **30–40k rows per year**
(one `pageview` per page load plus a handful of interaction events per
visit). That is trivial for MariaDB, so there is **no auto-pruning** —
the table is kept whole. If traffic ever grows orders of magnitude, add a
nightly prune of rows older than 2 years rather than a schema change.

## Query cookbook

```sql
-- Total pageviews over the last N days
SELECT COUNT(*) FROM AnalyticsEvents
WHERE event = 'pageview' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);

-- Search success rate (successful searches / all searches)
SELECT
  SUM(event = 'search_success') AS successes,
  SUM(event = 'search_run')     AS runs,
  ROUND(100 * SUM(event = 'search_success') / GREATEST(1, SUM(event = 'search_run')), 1) AS success_pct
FROM AnalyticsEvents
WHERE event IN ('search_run', 'search_success')
  AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);

-- Top artists by profile views
SELECT SUBSTRING(detail, 8) AS artist, COUNT(*) AS views
FROM AnalyticsEvents
WHERE event = 'profile_view' AND detail LIKE 'artist:%'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY detail ORDER BY views DESC LIMIT 10;

-- Top genres by successful searches (split detail on '|', then on ',')
SELECT genre, SUM(searches) AS searches
FROM (
  SELECT TRIM(SUBSTRING_INDEX(genre_part, ',', n.n)) AS genre, searches
  FROM (
    SELECT SUBSTRING_INDEX(detail, '|', 1) AS genre_part, COUNT(*) AS searches
    FROM AnalyticsEvents
    WHERE event = 'search_success' AND detail LIKE 'genre:%'
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY detail
  ) d
  JOIN (SELECT 1 n UNION SELECT 2 UNION SELECT 3) n
    ON CHAR_LENGTH(genre_part) - CHAR_LENGTH(REPLACE(genre_part, ',', '')) >= n.n - 1
) t
GROUP BY genre ORDER BY searches DESC LIMIT 10;

-- Daily pageview series (powers the admin dashboard chart)
SELECT DATE(created_at) AS day, COUNT(*) AS pageviews
FROM AnalyticsEvents
WHERE event = 'pageview' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at) ORDER BY day;
```

The admin dashboard (`pages/analytics.html`, `GET /getAnalyticsSummary`)
runs the first, third, fourth, and fifth of these queries through
`api/db/get_analytics_summary.php`.
