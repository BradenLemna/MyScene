document.getElementById("favArtist").addEventListener("click", function() {
    // Purely visual toggle for now — wire up to a real "favorites" endpoint
    // once one exists.
    const isNowActive = this.classList.toggle("active");
    this.innerHTML = isNowActive ? "&#9733; Favorited" : "&hearts; Fav Artist";
});

document.getElementById("viewSimilar").addEventListener("click", async function() {
    let genre = "rock";
    const button = this;
    button.disabled = true;

    try {
        // NOTE: "unkown.php" looks like a placeholder endpoint left over from
        // an earlier version — swap in the real "similar artists" route when
        // it's ready.
        await fetch("unkown.php", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                genre: genre
            })
        });
    } catch (err) {
        console.error("Couldn't load similar artists:", err);
    } finally {
        button.disabled = false;
    }
});
