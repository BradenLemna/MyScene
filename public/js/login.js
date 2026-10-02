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

document.getElementById("login").addEventListener("click", function() {

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
        toast("Please enter both a username and password.", "error");
        return;
    }

    const button = document.getElementById("login");
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Logging in...";

    fetch(API_BASE + "/verify_user", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: username,
            password: password
        })
    }).then(response => response.json())
      .then(data => {
          // Redirect to the main page on success (the page is index.html in
          // the parent directory — the old redirect pointed at a main.html
          // that does not exist).
          if (data.verified) {
              window.location.href = "../index.html";
          } else {
              toast("Invalid username or password", "error");
          }
      })
      .catch(err => {
          console.error("Login request failed:", err);
          toast("Couldn't reach the server. Please try again.", "error");
      })
      .finally(() => {
          button.disabled = false;
          button.textContent = originalLabel;
      });
});

// Submit on Enter inside either field.
document.getElementById("loginForm").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("login").click();
    }
});
