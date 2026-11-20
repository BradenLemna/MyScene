// Account registration (Batch 2). Client-side checks mirror the server's
// (username 3-20 [a-zA-Z0-9._], password min 8, confirm must match); the
// PHP db-api is the authority and its 400/409 messages are surfaced.
const API_BASE = (typeof window !== "undefined" && window.MYSCENE_API_BASE)
    ? window.MYSCENE_API_BASE.replace(/\/+$/, "")
    : "https://api.myscene.live";

// Toasts via shared ui.js (loaded first), with an alert() fallback.
function toast(message, kind = "info") {
    if (typeof window.showToast === "function") window.showToast(message, kind);
    else alert(message);
}

document.getElementById("register").addEventListener("click", function() {

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("passwordConfirm").value;

    if (!/^[a-zA-Z0-9._]{3,20}$/.test(username)) {
        toast("Username must be 3-20 characters (letters, numbers, dots, underscores).", "error");
        return;
    }
    if (password.length < 8) {
        toast("Password must be at least 8 characters.", "error");
        return;
    }
    if (password !== confirm) {
        toast("Passwords do not match.", "error");
        return;
    }

    const button = document.getElementById("register");
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Creating account...";

    fetch(API_BASE + "/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
            username: username,
            password: password
        })
    }).then(async response => {
        // The API answers errors as {"error": "..."} with a 4xx status
        // (e.g. 409 when the username is already taken) — surface the real
        // message instead of a generic failure alert.
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `The server rejected the request (HTTP ${response.status}).`);
        }
        return data;
    })
      .then(() => {
          // No auto-login: the user confirms the credentials on the login
          // page (the ?registered=1 note explains the redirect).
          window.location.href = "login.html?registered=1";
      })
      .catch(err => {
          console.error("Registration failed:", err);
          toast("Couldn't create the account: " + err.message, "error");
      })
      .finally(() => {
          button.disabled = false;
          button.textContent = originalLabel;
      });
});

// Submit on Enter inside any field.
document.getElementById("registerForm").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("register").click();
    }
});
