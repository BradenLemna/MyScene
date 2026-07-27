document.getElementById("addBandButton").addEventListener("click", function() {
    let name = document.getElementById("bandName").value.trim();
    let city = document.getElementById("bandCity").value.trim();
    let state = document.getElementById("bandState").value.trim();
    let genre = document.getElementById("bandGenre").value.trim();
    // let image = document.getElementById("bandImage").value;
    let socials = document.getElementById("instagramHandle").value.trim();

    if (!name || !city || !state || !genre) {
        alert("Artist name, city, state, and music genre must be filled in.");
        return;
    }

    const button = document.getElementById("addBandButton");
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Adding...";

    fetch("https://api.myscene.live/add_artist", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            artist_name: name,
            // longitude: getLongitude(city),
            // latitude: getLatitude(city),
            location_city: city,
            location_region: state,
            music_genre: genre,
            // image_src: image,
            insta_handle: socials,

        })
    }).then(response => response.json())
      .then(data => {
          if (data.success) {
                alert("Artist was successfully added to the database.");
                document.getElementById("bandSubmission").querySelectorAll("input").forEach(i => i.value = "");
          } else {
                alert("Artist name, city, state, and music genre must be filled in.");
          }
      })
      .catch(err => {
          console.error("Failed to add artist:", err);
          alert("Something went wrong submitting your band. Please try again.");
      })
      .finally(() => {
          button.disabled = false;
          button.textContent = originalLabel;
      });
});
