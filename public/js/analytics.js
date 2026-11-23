// Admin dashboard (Batch 3): site analytics + artist verification queue +
// the recent-changes feed (ActivityLog audit trail).
//
// Gate: the page is invisible to non-admins — if /me does not say
// is_admin:true the visitor is redirected home before anything renders.
// The daily-traffic chart is hand-rolled SVG (no chart library, zero
// dependencies).
//
// Loaded as an ES module (like index.js) so it can use js/api.js.

import { getAnalyticsSummary, getPendingArtists, getVerifiedArtists, setArtistStatus, getRecentActivity } from "./api.js";

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[ch]));
}

function toast(message, kind = "info") {
    if (typeof window.showToast === "function") window.showToast(message, kind);
    else alert(message);
}

const gateNote = document.getElementById("gateNote");
const dashboard = document.getElementById("dashboard");

// ---------- admin gate ----------
const me = window.mysceneSession ? await window.mysceneSession.getMe() : null;
if (!me || me.is_admin !== true) {
    // Not an admin (or not logged in): bounce home. replace() keeps this
    // page out of the back-button history.
    window.location.replace("../index.html");
} else {
    gateNote.hidden = true;
    dashboard.hidden = false;
    loadAnalytics(30);
    loadPending();
    loadVerified();
    loadRecentActivity();
}

// ---------- analytics section ----------
document.querySelectorAll(".dashToggle .btn").forEach((btn) => {
    btn.addEventListener("click", () => loadAnalytics(Number(btn.dataset.days)));
});

async function loadAnalytics(days) {
    document.querySelectorAll(".dashToggle .btn").forEach((btn) => {
        const active = Number(btn.dataset.days) === days;
        btn.classList.toggle("pressed", active);
        btn.setAttribute("aria-pressed", String(active));
    });
    const chartNote = document.getElementById("chartNote");
    try {
        const data = await getAnalyticsSummary(days);
        document.getElementById("totalPageviews").textContent = data.totals.pageviews;
        document.getElementById("totalSearches").textContent = data.totals.searches;
        document.getElementById("totalProfileViews").textContent = data.totals.profile_views;
        renderChart("trafficChart", data.daily_pageviews || [], {
            gradientId: "gradPageviews", label: "pageviews", emptyText: "No pageviews in this window.",
            colorTop: "#1084d0", colorBottom: "#000080",
        });
        renderChart("searchesChart", data.daily_searches || [], {
            gradientId: "gradSearches", label: "searches", emptyText: "No searches in this window.",
            colorTop: "#3a9a3a", colorBottom: "#005900", height: 132, compact: true,
        });
        renderChart("profileViewsChart", data.daily_profile_views || [], {
            gradientId: "gradProfileViews", label: "profile views", emptyText: "No profile views in this window.",
            colorTop: "#c05aa8", colorBottom: "#5a2a52", height: 132, compact: true,
        });
        renderTopBars("topArtists", data.top_artists || [], "views");
        renderTopBars("topGenres", data.top_genres || [], "searches");
        chartNote.textContent = (data.totals.pageviews || 0) === 0
            ? "No pageviews recorded in this window."
            : "";
    } catch (err) {
        chartNote.textContent = `Could not load analytics: ${err.message}`;
    }
}

/**
 * Render a daily-series SVG bar chart. The series is continuous (zero-days
 * included by the backend), so bars exist for every day in the window.
 * @param {string} svgId - element id of the <svg> to fill
 * @param {Array<{date: string, [key: string]: any}>} series
 * @param {object} opts - {gradientId, label, emptyText, colorTop, colorBottom, height, compact}
 */
function renderChart(svgId, series, opts) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    const W = 640;
    const H = opts.height || 150;
    const padL = opts.compact ? 8 : 14;
    const padR = opts.compact ? 8 : 14;
    const padT = 20;
    const padB = 24;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const label = (opts.label || "events").toLowerCase();

    const n = series.length;
    const valueKey = n > 0 ? Object.keys(series[0]).find((k) => k !== "date") : null;
    const values = valueKey ? series.map((d) => Number(d[valueKey]) || 0) : [];
    const max = values.length ? Math.max(0, ...values) : 0;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.setProperty("--barTop", opts.colorTop || "#1084d0");
    svg.style.setProperty("--barBottom", opts.colorBottom || "#000080");

    // Gradient fill for the bars. Colors come from per-chart CSS vars so the
    // three charts can each carry their own accent.
    const defs = `<defs><linearGradient id="${opts.gradientId}" x1="0" y1="0" x2="0" y2="1">`
        + `<stop offset="0" style="stop-color:var(--barTop)"/>`
        + `<stop offset="1" style="stop-color:var(--barBottom)"/>`
        + `</linearGradient></defs>`;

    if (n === 0 || max === 0) {
        svg.innerHTML = defs
            + `<line x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}" class="chartAxis"/>`
            + `<text x="${W / 2}" y="${padT + innerH / 2}" text-anchor="middle" class="chartEmpty">${escapeHtml(opts.emptyText || "No data in this window.")}</text>`;
        return;
    }

    // Gridlines + integer labels for the upper 1/4, 1/2, 3/4 and top lines.
    let grid = "";
    const gridCount = 4;
    for (let i = 1; i <= gridCount; i++) {
        const y = padT + (innerH * (gridCount - i)) / gridCount;
        const v = Math.round((max * i) / gridCount);
        grid += `<line x1="${padL}" y1="${y.toFixed(2)}" x2="${W - padR}" y2="${y.toFixed(2)}" class="chartGridLine"/>`
            + (opts.compact ? "" : `<text x="${padL + 2}" y="${(y - 3).toFixed(2)}" class="chartGridLabel">${v}</text>`);
    }

    // Bars, with the peak bar visually marked.
    let bars = "";
    const gap = n > 1 ? Math.min(3, innerW * 0.004) : 0;
    const barW = Math.max(1, (innerW - gap * (n - 1)) / n);
    series.forEach((d, i) => {
        const v = values[i];
        const h = Math.max(1.5, (v / max) * innerH);
        const x = padL + i * (barW + gap);
        const y = padT + innerH - h;
        const isPeak = v === max;
        bars += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" `
            + `width="${Math.max(0.5, barW - 0.5).toFixed(2)}" height="${h.toFixed(2)}" `
            + `class="chartBar${isPeak ? " chartBarPeak" : ""}" fill="url(#${opts.gradientId})">`
            + `<title>${d.date}: ${v} ${label}</title></rect>`;
    });

    // Bottom axis + date tick labels (MM-DD, at most ~8 ticks).
    const axisY = padT + innerH;
    const tickCount = Math.min(8, n);
    let ticks = "";
    for (let i = 0; i < tickCount; i++) {
        const idx = Math.round(i * (n - 1) / Math.max(1, tickCount - 1));
        const date = series[idx] && series[idx].date;
        if (!date) continue;
        const x = padL + idx * (barW + gap) + barW / 2;
        const anchor = i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle";
        const tickDate = date.slice(5); // MM-DD
        ticks += `<text x="${x.toFixed(2)}" y="${H - 8}" text-anchor="${anchor}" class="chartTick">${escapeHtml(tickDate)}</text>`;
    }

    svg.innerHTML = defs
        + grid
        + `<line x1="${padL}" y1="${axisY}" x2="${W - padR}" y2="${axisY}" class="chartAxis"/>`
        + `<text x="${W - padR}" y="11" text-anchor="end" class="chartPeak">peak ${max}/day</text>`
        + bars
        + ticks;
}

/**
 * Render a ranked horizontal-bar list (top artists / top genres).
 * items: e.g. [{artist: "...", views: N}] or [{genre: "...", searches: N}]
 *   the non-value key is the name, the key passed as valueKey is the count.
 */
function renderTopBars(id, items, valueKey) {
    const container = document.getElementById(id);
    if (!container) return;
    if (!items || items.length === 0) {
        container.innerHTML = `<p class="topBarEmpty">No data yet.</p>`;
        return;
    }
    const nameKey = Object.keys(items[0]).find((k) => k !== valueKey) || "artist";
    const unit = valueKey === "views" ? "views" : "searches";
    const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
    container.innerHTML = items.map((item, i) => {
        const name = String(item[nameKey] ?? "");
        const val = Number(item[valueKey]) || 0;
        const pct = Math.max(3, Math.round((val / max) * 100));
        return `<div class="topBarRow">`
            + `<span class="topBarRank">${String(i + 1).padStart(2, "0")}</span>`
            + `<span class="topBarName">${escapeHtml(name)}</span>`
            + `<span class="topBarTrack"><span class="topBarFill" style="width:${pct}%"></span></span>`
            + `<span class="topBarValue">${val} ${unit}</span>`
            + `</div>`;
    }).join("");
}

// ---------- pending artists section ----------
const pendingBody = document.getElementById("pendingBody");
const pendingTable = document.getElementById("pendingTable");
const pendingEmpty = document.getElementById("pendingEmpty");

async function loadPending() {
    try {
        const rows = await getPendingArtists();
        document.getElementById("pendingCount").textContent =
            rows.length === 1 ? "1 request" : `${rows.length} requests`;
        pendingEmpty.hidden = rows.length > 0;
        pendingTable.hidden = rows.length === 0;
        pendingEmpty.textContent = "No pending requests.";
        pendingBody.innerHTML = rows.map((row) => `
            <tr data-username="${escapeHtml(row.username)}">
                <td>${escapeHtml(row.username)}</td>
                <td>${escapeHtml(row.created_at || "")}</td>
                <td class="rowActions">
                    <button class="btn pink" type="button" data-action="verified">Approve</button>
                    <button class="btn ghost" type="button" data-action="none">Reject</button>
                </td>
            </tr>`).join("");
    } catch (err) {
        pendingTable.hidden = true;
        pendingEmpty.hidden = false;
        pendingEmpty.textContent = `Could not load pending requests: ${err.message}`;
    }
}

pendingBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    const username = row ? row.dataset.username : null;
    const status = btn.dataset.action;
    if (!username || (status !== "verified" && status !== "none")) return;

    row.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
        await setArtistStatus(username, status);
        toast(status === "verified" ? `${username} approved.` : `${username} rejected.`, "success");
        // Approving moves an account into Artist Profiles; rejecting or
        // revoking leaves it — refresh both sections plus the feed.
        await Promise.all([loadPending(), loadVerified(), loadRecentActivity()]);
    } catch (err) {
        toast(err.message, "error");
        row.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    }
});

// ---------- artist profiles section ----------
// Accounts that currently hold the artist role. Revoke takes the role back
// (artist_status='none'); the account can request access again later.
const verifiedBody = document.getElementById("verifiedBody");
const verifiedTable = document.getElementById("verifiedTable");
const verifiedEmpty = document.getElementById("verifiedEmpty");

async function loadVerified() {
    try {
        const rows = await getVerifiedArtists();
        document.getElementById("verifiedCount").textContent =
            rows.length === 1 ? "1 account" : `${rows.length} accounts`;
        verifiedEmpty.hidden = rows.length > 0;
        verifiedTable.hidden = rows.length === 0;
        verifiedEmpty.textContent = "No verified artists yet.";
        verifiedBody.innerHTML = rows.map((row) => `
            <tr data-username="${escapeHtml(row.username)}">
                <td>${escapeHtml(row.username)}</td>
                <td>${escapeHtml(row.created_at || "")}</td>
                <td>${row.artist_verified_at ? escapeHtml(row.artist_verified_at) : "&mdash;"}</td>
                <td class="rowActions">
                    <button class="btn ghost" type="button" data-action="revoke">Revoke</button>
                </td>
            </tr>`).join("");
    } catch (err) {
        verifiedTable.hidden = true;
        verifiedEmpty.hidden = false;
        verifiedEmpty.textContent = `Could not load artist profiles: ${err.message}`;
    }
}

verifiedBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='revoke']");
    if (!btn) return;
    const row = btn.closest("tr");
    const username = row ? row.dataset.username : null;
    if (!username) return;

    btn.disabled = true;
    try {
        await setArtistStatus(username, "none");
        toast(`${username}'s artist role revoked.`, "success");
        await Promise.all([loadVerified(), loadRecentActivity()]);
    } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
    }
});

// ---------- recent changes section ----------
// ActivityLog rows (see api/db/get_recent_activity.php). The action maps
// to the human-readable verb; the target is what the verb acts on.
const ACTIVITY_VERBS = {
    account_created: () => "created an account",
    artist_requested: (target) => `requested artist access for <b>${target}</b>`,
    artist_added: (target) => `added artist <b>${target}</b>`,
    event_added: (target) => `added event <b>${target}</b>`,
    artist_approved: (target) => `approved artist access for <b>${target}</b>`,
    artist_rejected: (target) => `rejected artist access for <b>${target}</b>`,
};

const ACTIVITY_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a db-api timestamp ("YYYY-MM-DD HH:MM:SS", server-local) for the
 * feed. Falls back to the raw string when the shape is unexpected.
 */
function formatActivityTime(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
        return value || "";
    }
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    const [hh, mm] = value.slice(11, 16).split(":").map(Number);
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${ACTIVITY_MONTHS[m - 1]} ${d}, ${y} ${hour12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
}

async function loadRecentActivity() {
    const feed = document.getElementById("activityFeed");
    const empty = document.getElementById("activityEmpty");
    const count = document.getElementById("activityCount");
    try {
        const rows = await getRecentActivity();
        count.textContent = rows.length === 0
            ? ""
            : `${rows.length} change${rows.length === 1 ? "" : "s"}`;
        empty.hidden = rows.length > 0;
        feed.innerHTML = rows.map((row) => {
            const target = escapeHtml(row.target);
            const verb = ACTIVITY_VERBS[row.action];
            const text = verb
                ? verb(target)
                : `${escapeHtml(row.action)} <b>${target}</b>`;
            return `<li class="activityItem">`
                + `<span class="activityText">${text}</span>`
                + `<span class="activityMeta">by ${escapeHtml(row.actor_username)} · ${escapeHtml(formatActivityTime(row.created_at))}</span>`
                + `</li>`;
        }).join("");
    } catch (err) {
        feed.innerHTML = "";
        empty.hidden = false;
        empty.textContent = `Could not load recent changes: ${err.message}`;
    }
}
