/**
 * @fileoverview Login Controller for Private Auction
 * Handles 6-digit session PIN entry, auto-focus navigation, clipboard pasting,
 * backend API authentication via POST /api/sessions/validate, and role-based redirection.
 */

const API_BASE_URL = "https://auction-api-7d4r.onrender.com/api";

const inputs = document.querySelectorAll(".code-input");
const button = document.getElementById("enterButton");

/**
 * Resets all 6-digit input fields to blank and shifts focus back to the first box.
 */
const resetInputs = () => {
  inputs.forEach((input) => {
    input.value = "";
  });
  if (inputs[0]) {
    inputs[0].focus();
  }
};

// -------------------------------------------------------------
// INPUT NAVIGATION & KEYBOARD HANDLERS
// -------------------------------------------------------------

// Move automatically between input fields on digit entry / backspace
inputs.forEach((input, index) => {
  input.addEventListener("input", () => {
    // Sanitize input to digits only
    input.value = input.value.replace(/[^0-9]/g, "");

    // Auto-advance focus to the next field if a digit was entered
    if (input.value && index < inputs.length - 1) {
      inputs[index + 1].focus();
    }
  });

  input.addEventListener("keydown", (event) => {
    // Focus previous field when pressing Backspace on an empty field
    if (event.key === "Backspace" && !input.value && index > 0) {
      inputs[index - 1].focus();
    }
  });
});

// Handle pasting a full 6-digit PIN into the first box
if (inputs[0]) {
  inputs[0].addEventListener("paste", (event) => {
    event.preventDefault();

    const paste = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    paste.split("").forEach((digit, index) => {
      if (inputs[index]) {
        inputs[index].value = digit;
      }
    });

    if (paste.length === 6 && inputs[5]) {
      inputs[5].focus();
    }
  });
}

// -------------------------------------------------------------
// KEYBOARD HANDLER FOR ENTER KEY
// -------------------------------------------------------------
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault(); // Prevent default form submission behavior
    button.click(); // Trigger the click event on the enterButton
  }
});

// -------------------------------------------------------------
// SUBMIT & AUTHENTICATION HANDLER
// -------------------------------------------------------------

button.addEventListener("click", async () => {
  let code = "";
  inputs.forEach((input) => {
    code += input.value.trim();
  });

  // Validate code length before network call
  if (code.length !== 6) {
    Swal.fire({
      icon: "warning",
      title: "Incomplete Session Key",
      text: "Please enter the complete 6-digit access code.",
      confirmButtonColor: "#d4af37",
    }).then(() => {
      resetInputs();
    });
    return;
  }

  button.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/sessions/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: code }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Invalid or expired session key.");
    }

    // Extract full session payload (contains key, is_admin, contact_name, etc.)
    const session = data.data || { key: code, is_admin: false };

    // Display welcome notification custom to access level
    Swal.fire({
      icon: "success",
      title: "Access Granted",
      text: session.is_admin
        ? "Welcome to the Auction Control Center."
        : "Welcome to the private auction.",
      timer: 1500,
      showConfirmButton: false,
    }).then(() => {
      // Persist full session object in localStorage so admin.js can verify is_admin
      localStorage.setItem("auction_session", JSON.stringify(session));

      // Role-based routing
      if (session.is_admin) {
        window.location.href = "admin.html";
      } else {
        window.location.href = "bid.html";
      }
    });
  } catch (err) {
    // Failure state: display error alert and reset input boxes on dismiss
    console.log("[Login] Session validation failed:", err.message);
    Swal.fire({
      icon: "error",
      title: "Access Denied",
      text: "This access key is invalid or expired.",
      confirmButtonColor: "#d4af37",
    }).then(() => {
      resetInputs();
    });
  } finally {
    button.disabled = false;
  }
});