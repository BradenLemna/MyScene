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
        renderChart(data.daily_pageviews || []);
        renderList("topArtists", (data.top_artists || []).map((a) => `${a.artist} — ${a.views} views`));
        renderList("topGenres", (data.top_genres || []).map((g) => `${g.genre} — ${g.searches} searches`));
        chartNote.textContent = (data.daily_pageviews || []).length === 0
            ? "No pageviews recorded in this window."
            : "";
    } catch (err) {
        chartNote.textContent = `Could not load analytics: ${err.message}`;
    }
}

/** Render the daily pageview series as a dependency-free SVG bar chart. */
function renderChart(series) {
    const svg = document.getElementById("trafficChart");
    const W = 640;
    const H = 180;
    const padL = 10;
    const padR = 10;
    const padT = 20;
    const padB = 24;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const n = series.length;
    const max = Math.max(1, ...series.map((d) => d.pageviews));

    let bars = "";
    if (n > 0) {
        const gap = n > 1 ? Math.min(4, innerW * 0.004) : 0;
        const barW = Math.max(1, (innerW - gap * (n - 1)) / n);
        series.forEach((d, i) => {
            const h = d.pageviews > 0 ? Math.max(2, (d.pageviews / max) * innerH) : 0;
            const x = padL + i * (barW + gap);
            const y = padT + innerH - h;
            bars += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" `
                + `width="${Math.max(0.5, barW - 1).toFixed(2)}" height="${h.toFixed(2)}" `
                + `class="chartBar"><title>${d.date}: ${d.pageviews} pageview(s)</title></rect>`;
        });
    }

    const axisY = padT + innerH;
    const first = n > 0 ? series[0].date : "";
    const last = n > 0 ? series[n - 1].date : "";
    svg.innerHTML =
        `<line x1="${padL}" y1="${axisY}" x2="${W - padR}" y2="${axisY}" class="chartAxis"/>`
        + `<text x="${padL}" y="13" class="chartLabel">peak ${max}/day</text>`
        + bars
        + `<text x="${padL}" y="${H - 8}" class="chartLabel">${first}</text>`
        + `<text x="${W - padR}" y="${H - 8}" text-anchor="end" class="chartLabel">${last}</text>`;
}

function renderList(id, items) {
    const list = document.getElementById(id);
    if (!list) return;
    if (items.length === 0) {
        list.innerHTML = `<li class="dashListEmpty">None yet.</li>`;
        return;
    }
    list.innerHTML = items.map((text) => `<li>${escapeHtml(text)}</li>`).join("");
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
