// Shared API base — mirrors js/api.js so the
// production default can be overridden locally by setting
// window.MYSCENE_API_BASE (e.g. 'http://127.0.0.1:3000') before this script runs.
const API_BASE = (typeof window !== 'undefined' && window.MYSCENE_API_BASE)
    ? window.MYSCENE_API_BASE.replace(/\/+$/, '')
    : 'https://api.myscene.live';

// Toasts via shared ui.js (loaded first), with an alert() fallback.
function toast(message, kind = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, kind);
    else alert(message);
}

// ---------- artist gating (Batch 2) ----------
// The API now requires a verified-artist session for /add_artist. The page
// mirrors the three states client-side: guest -> login prompt, fan/pending
// -> request-access panel, verified -> the form. window.mysceneSession
// (js/session.js, loaded first) is the source of truth.
function showPanel(id) {
    ["loginPrompt", "artistAccess", "bandSubmission"].forEach(function (panel) {
        document.getElementById(panel).hidden = panel !== id;
    });
}

function setPendingState() {
    document.getElementById("requestAccessButton").hidden = true;
    document.getElementById("pendingNote").hidden = false;
    document.getElementById("artistAccessText").textContent = "Your artist access request is pending.";
}

function renderArtistState(me) {
    if (!me) {
        showPanel("loginPrompt");
        return;
    }
    if (me.artist_status === "verified") {
        showPanel("bandSubmission");
        return;
    }
    showPanel("artistAccess");
    if (me.artist_status === "pending") {
        setPendingState();
    }
}

window.mysceneSession.getMe().then(renderArtistState);

document.getElementById("requestAccessButton").addEventListener("click", function() {
    const button = document.getElementById("requestAccessButton");
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Requesting...";

    fetch(API_BASE + "/request_artist_access", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
    })
      .then(async response => {
          // The API answers errors as {"error": "..."} with a 4xx status —
          // surface the real message instead of a generic failure alert.
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
              throw new Error(data.error || `The server rejected the request (HTTP ${response.status}).`);
          }
          return data;
      })
      .then(() => {
          setPendingState();
          toast("Request sent — an admin will verify you.", "success");
      })
      .catch(err => {
          console.error("Artist access request failed:", err);
          toast("Couldn't send the request: " + err.message, "error");
      })
      .finally(() => {
          button.disabled = false;
          button.textContent = originalLabel;
      });
});

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

// UX-09: genre suggestions from the live list. Free text stays allowed —
// that is how new genres enter the database. On failure the field is plain
// free text with a note, never fake options (batch-1 honesty rule).
async function loadGenreSuggestions() {
    const listEl = document.getElementById("genreList");
    const noteEl = document.getElementById("genreNote");
    if (!listEl) return;
    try {
        const response = await fetch(API_BASE + "/getGenreList");
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        (Array.isArray(data.genres) ? data.genres : []).forEach(genre => {
            const option = document.createElement("option");
            option.value = String(genre);
            listEl.appendChild(option);
        });
    } catch (err) {
        console.warn("Genre suggestions unavailable:", err);
        if (noteEl) noteEl.hidden = false;
    }
}
loadGenreSuggestions();

// UX-10: direct path to the artist the visitor just added. A fresh artist
// with a novel genre will not surface in genre search, but the profile URL
// always resolves.
function showSuccessNote(artistName) {
    const note = document.getElementById("addSuccessNote");
    if (!note) return;
    note.innerHTML = `Added <strong>${escapeHtml(artistName)}</strong> &mdash; `
        + `<a href="viewArtist.html?artist=${encodeURIComponent(artistName)}">view their profile &rarr;</a>`;
    note.hidden = false;
}

// The note describes the last successful add — editing the form again
// makes it stale.
document.querySelectorAll("#bandSubmission input").forEach(input => {
    input.addEventListener("input", () => {
        const note = document.getElementById("addSuccessNote");
        if (note) note.hidden = true;
    });
});

document.getElementById("addBandButton").addEventListener("click", function() {
    let name = document.getElementById("bandName").value.trim();
    let city = document.getElementById("bandCity").value.trim();
    let state = document.getElementById("bandState").value.trim();
    let genre = document.getElementById("bandGenre").value.trim();
    let socials = document.getElementById("instagramHandle").value.trim();

    if (!name || !city || !state || !genre) {
        toast("Artist name, city, state, and music genre must be filled in.", "error");
        return;
    }

    const button = document.getElementById("addBandButton");
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Adding...";

    fetch(API_BASE + "/add_artist", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            artist_name: name,
            location_city: city,
            location_region: state,
            music_genre: genre,
            insta_handle: socials,
        })
    }).then(async response => {
        // The API answers errors as {"error": "..."} with a 4xx status
        // (e.g. 409 when the artist name already exists) — surface the real
        // message instead of a generic failure alert.
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `The server rejected the request (HTTP ${response.status}).`);
        }
        return data;
    })
      .then(data => {
          if (data.success) {
                toast("Artist was successfully added to the database.", "success");
                document.getElementById("bandSubmission").querySelectorAll("input").forEach(i => i.value = "");
                showSuccessNote(name);
          } else {
                toast("Artist name, city, state, and music genre must be filled in.", "error");
          }
      })
      .catch(err => {
          console.error("Failed to add artist:", err);
          toast("Something went wrong submitting your band: " + err.message, "error");
      })
      .finally(() => {
          button.disabled = false;
          button.textContent = originalLabel;
      });
});
