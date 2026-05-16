document.getElementById("login").addEventListener("click", function() {

    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;

    fetch("https://api.myscene.live/verify_user", {
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
          // Redirect to main page
          // Else show error message
          if (data.verified) {
              window.location.href = "main.html";
          } else {
              alert("Invalid username or password");
          }
      });
});
