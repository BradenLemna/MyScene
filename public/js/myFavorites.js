// My Favorites (Batch 5) — Server-side favorites grid.
//
// Renders the signed-in user's favorited artists as the same card template
// as the homepage, each with the heart (tap to remove). The heart click
// goes through the shared favorites module (see public/js/favorites.js),
// which owns the toggle, the analytics event, and the guest redirect.
import * as favorites from "./favorites.js";

const grid = document.getElementById("favoritesGrid");
const empty = document.getElementById("favoritesEmpty");
const contextEl = document.getElementById("favoritesContext");

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function artistImageCandidates(artist) {
    const candidates = [
        `../assets/images/${String(artist.artist_name ?? "").replace(/\s+/g, "")}.png`,
    ];
    if (artist.image_src) candidates.push(artist.image_src);
    return candidates;
}

function artistImgTag(artist) {
    const candidates = JSON.stringify(artistImageCandidates(artist));
    const alt = escapeHtml(artist.artist_name);
    return `<img src="${escapeHtml(artistImageCandidates(artist)[0])}" class="artistImg" alt="${alt}"
        data-candidates="${escapeHtml(candidates)}" data-index="0"
        onerror="this._onImgError = true; (function loop(img){
            const list = JSON.parse(img.dataset.candidates);
            const next = Number(img.dataset.index) + 1;
            if (next < list.length) { img.dataset.index = String(next); img.src = list[next]; }
            else { img.parentElement.classList.add('noImg'); img.remove(); }
        })(this)">`;
}

function cardHtml(artist, index) {
    const name = artist.artist_name ?? "";
    return `
        <div class="artistBox" data-artist-index="${index}" tabindex="0" role="button" aria-label="View ${escapeHtml(name)}">
            <div class="artistCard">
                <div class="artistImgWrap">
                    <button type="button" class="cardHeart" data-heart-artist="${escapeHtml(name)}" aria-pressed="false" aria-label="Favorite ${escapeHtml(name)}" title="Remove from favorites">&hearts;</button>
                    ${artistImgTag(artist)}
                </div>
                <div class="artistCardBody">
                    <h3>${escapeHtml(name)}</h3>
                    <div class="artistMeta"><span class="genreTag">${escapeHtml(artist.music_genre ?? "")}</span></div>
                </div>
            </div>
        </div>`;
}

function render() {
    const artists = favorites.getCachedFavoriteArtists();
    if (artists.length === 0) {
        grid.innerHTML = "";
        grid.style.display = "none";
        empty.style.display = "block";
        empty.innerHTML = "No favorites yet &mdash; tap the heart on any artist.";
        empty.insertAdjacentHTML("beforeend",
            ` <a href="../index.html">Browse the scene &rarr;</a>`);
        if (contextEl) contextEl.textContent = "No favorites yet";
        return;
    }
    empty.style.display = "none";
    grid.style.display = "grid";
    grid.innerHTML = artists.map((artist, i) => cardHtml(artist, i)).join("");
    if (contextEl) {
        contextEl.textContent = `${artists.length} favorite${artists.length === 1 ? "" : "s"}`;
    }
    favorites.syncHeartButtons(grid);
    wireCards();
}

function openArtist(name) {
    window.location.href = `viewArtist.html?artist=${encodeURIComponent(name)}`;
}

function wireCards() {
    grid.querySelectorAll(".artistBox").forEach(box => {
        if (box.dataset.wired === "1") return;
        box.dataset.wired = "1";
        const artist = favorites.getCachedFavoriteArtists()[Number(box.dataset.artistIndex)];
        if (!artist || !artist.artist_name) return;
        const name = artist.artist_name;
        box.addEventListener("click", () => openArtist(name));
        box.addEventListener("keydown", e => {
            if (e.target.closest("[data-heart-artist]")) return;
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openArtist(name); }
        });
    });
}

// One delegated listener owns the whole grid: hearts (remove) + cards
// (open the profile). Keeps innerHTML re-renders simple.
grid.addEventListener("click", async (e) => {
    const heart = e.target.closest("[data-heart-artist]");
    if (heart) {
        e.stopPropagation();
        const name = heart.dataset.heartArtist;
        if (!name) return;
        heart.disabled = true;
        try {
            // The shared module owns the toggle + analytics event; a guest
            // click redirects to login (the promise settles and we bail).
            const favorited = await favorites.toggleFavorite(name);
            if (favorited === false) {
                // Removed — re-render so the card disappears honestly.
                render();
            }
        } finally {
            heart.disabled = false;
        }
        return;
    }
});

// Hearts must not trigger the card's keydown → profile navigation.
grid.addEventListener("keydown", (e) => {
    if (e.target.closest("[data-heart-artist]")) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
        }
    }
});

(async function init() {
    const ok = await favorites.getFavoritesReady();
    if (ok === false) {
        const status = favorites.getLoadStatus();
        if (status === 401) {
            // Guests: redirect to login — never a silent failure.
            window.location.href = "login.html";
            return;
        }
        // Offline/unknown failure: honest state, not a fake empty list.
        grid.innerHTML = "";
        grid.style.display = "none";
        empty.style.display = "block";
        empty.innerHTML = "Favorites are unavailable right now &mdash; check your connection and try again.";
        return;
    }
    render();
})();
