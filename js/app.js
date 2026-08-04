/**
 * @fileoverview Auction Bidding Arena Client Controller
 * Manages active session verification, dynamic backend auction fetching,
 * real-time WebSocket updates (including active modal feedback), live countdown timers,
 * bid submission API requests, and session logout.
 */

const API_BASE_URL = "https://auction-api-7d4r.onrender.com/api";
const WS_BASE_URL = "wss://auction-api-7d4r.onrender.com";

// -------------------------------------------------------------
// 1. SESSION & AUTHENTICATION GUARD
// -------------------------------------------------------------
const storedSession = localStorage.getItem("auction_session");

// Redirect to login if no stored session exists
if (!storedSession) {
  window.location.href = "index.html";
}

const sessionData = JSON.parse(storedSession);
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour expiration limit

// Expire session and force re-login if session age exceeds duration
if (Date.now() - sessionData.created > SESSION_DURATION) {
  localStorage.removeItem("auction_session");
  window.location.href = "index.html";
}

// -------------------------------------------------------------
// 2. DOM ELEMENTS & GLOBAL STATE
// -------------------------------------------------------------
let currentAuction = null;
let highestBid = 0;
let countdownInterval = null;
let socket = null;

const modal = document.getElementById("modal");
const modalCurrentThreshold = document.getElementById("modalCurrentThreshold");
const price = document.getElementById("price");
const countdownElement = document.getElementById("countdown");
const auctionTitle = document.querySelector(".details h1");
const auctionDescription = document.querySelector(".details p");
const auctionImage = document.getElementById("painting");
const bidInput = document.getElementById("bidInput");
const bidButton = document.getElementById("bidButton");
const submitButton = document.getElementById("submit");
const cancelButton = document.getElementById("cancel");
const logoutButton = document.getElementById("logoutButton");
const bidderNameElement = document.getElementById("bidderName");

// Populate Bidder Name from session payload
if (bidderNameElement && sessionData) {
  bidderNameElement.textContent =
    sessionData.contact_name ||
    sessionData.name ||
    `Session #${sessionData.key}`;
}

/**
 * Resets the bid input field to blank and restores default styling.
 */
const clearBidInput = () => {
  if (bidInput) {
    bidInput.value = "";
    bidInput.style.borderColor = "";
    bidInput.style.color = "";
  }
};

/**
 * Updates the live threshold indicator and input field validation inside the modal.
 */
function updateModalThresholdUI() {
  if (modalCurrentThreshold) {
    modalCurrentThreshold.textContent = `$ ${highestBid.toLocaleString()}`;
  }

  // Validate current typed input against the live highest bid
  if (bidInput && bidInput.value) {
    const currentInputValue = Number(bidInput.value);
    if (currentInputValue <= highestBid) {
      bidInput.style.borderColor = "#ef4444";
      bidInput.style.color = "#ef4444";
    } else {
      bidInput.style.borderColor = "#22c55e";
      bidInput.style.color = "";
    }
  }
}

// -------------------------------------------------------------
// 3. WEBSOCKET REAL-TIME LISTENER
// -------------------------------------------------------------

/**
 * Establishes real-time WebSocket connection to the backend server.
 * Handles live updates for 'AUCTION_INIT' and 'NEW_BID' events.
 */
function initWebSocket() {
  socket = new WebSocket(WS_BASE_URL);

  socket.onopen = () => {
    console.log("⚡ [WebSocket] Connected to live auction feed.");
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      // Initial state payload received upon connection
      if (message.type === "AUCTION_INIT" && message.data) {
        updateAuctionUI(message.data);
      }

      // Real-time broadcast triggered when any user places a new bid
      if (message.type === "NEW_BID" && message.data) {
        const newBidAmount = Number(message.data.highest_bid);

        if (newBidAmount > highestBid) {
          highestBid = newBidAmount;

          // 1. Update main page price card
          if (price) {
            price.textContent = "$ " + highestBid.toLocaleString();

            // Visual feedback effect on price change
            price.style.transition = "transform 0.2s ease, color 0.2s ease";
            price.style.color = "#d4af37";
            price.style.transform = "scale(1.08)";

            setTimeout(() => {
              price.style.color = "";
              price.style.transform = "scale(1.0)";
            }, 600);
          }

          // 2. Real-time update inside modal if user currently has modal open
          if (modal && modal.classList.contains("active")) {
            updateModalThresholdUI();

            // Flash threshold indicator to alert user instantly
            if (modalCurrentThreshold) {
              modalCurrentThreshold.style.transition = "color 0.3s ease";
              modalCurrentThreshold.style.color = "#ef4444";

              setTimeout(() => {
                modalCurrentThreshold.style.color = "#d4af37";
              }, 1000);
            }
          }
        }

        // Handle anti-sniping extension
        if (message.data.new_end_time) {
          console.log("[WebSocket] Auction extended via anti-sniping rule.");
          startCountdown(new Date(message.data.new_end_time));
        }
      }
    } catch (err) {
      console.error("❌ [WebSocket] Parsing error:", err);
    }
  };

  socket.onclose = () => {
    console.warn(
      "⚠️ [WebSocket] Connection closed. Attempting reconnect in 3s...",
    );
    setTimeout(initWebSocket, 3000);
  };

  socket.onerror = (error) => {
    console.error("❌ [WebSocket] Error encountered:", error);
  };
}

// -------------------------------------------------------------
// 4. FETCH ACTIVE AUCTION FROM BACKEND
// -------------------------------------------------------------

/**
 * Fetches the current live auction record from Express API
 * and populates all relevant HTML elements dynamically.
 */
async function fetchActiveAuction() {
  try {
    const response = await fetch(`${API_BASE_URL}/auctions/active`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-session-key": sessionData.key,
      },
    });

    const result = await response.json();

    if (!response.ok || !result.success || !result.data) {
      throw new Error(
        result.error || "No active auction available at this time.",
      );
    }

    updateAuctionUI(result.data);
  } catch (error) {
    Swal.fire({
      icon: "error",
      title: "Auction Unavailable",
      text: error.message || "Failed to load active auction details.",
      confirmButtonColor: "#d4af37",
      background: "#111827",
      color: "#fff",
    });
  }
}

/**
 * Updates DOM elements with auction data.
 * @param {Object} auctionData - Auction object from server.
 */
function updateAuctionUI(auctionData) {
  currentAuction = auctionData;

  // Render auction metadata to DOM
  if (auctionTitle && currentAuction.title) {
    auctionTitle.textContent = currentAuction.title;
  }

  if (auctionDescription && currentAuction.description) {
    auctionDescription.textContent = currentAuction.description;
  }

  if (auctionImage && currentAuction.image_url) {
    auctionImage.src = currentAuction.image_url;
    auctionImage.alt = currentAuction.title || "Auction Item";
  }

  // Determine current highest bid baseline
  highestBid =
    Number(currentAuction.highest_bid) > 0
      ? Number(currentAuction.highest_bid)
      : Number(currentAuction.starting_bid);

  if (price) {
    price.textContent = "$ " + highestBid.toLocaleString();
  }

  updateModalThresholdUI();

  // Initialize countdown timer with server end_time
  if (currentAuction.end_time) {
    startCountdown(new Date(currentAuction.end_time));
  }
}

// -------------------------------------------------------------
// 5. COUNTDOWN TIMER CONTROLLER
// -------------------------------------------------------------

/**
 * Calculates remaining auction duration and updates the DOM every second.
 * @param {Date} endTime - Auction expiration timestamp.
 */
function startCountdown(endTime) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  function updateCountdown() {
    const now = new Date();
    const difference = endTime - now;

    if (difference <= 0) {
      if (countdownElement) {
        countdownElement.innerHTML = "Auction Closed";
      }
      const badge = document.querySelector(".badge");
      if (badge) {
        badge.classList.add("closed");
      }
      if (bidButton) {
        bidButton.disabled = true;
      }
      clearInterval(countdownInterval);
      return;
    }

    const hours = Math.floor(difference / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    if (countdownElement) {
      countdownElement.innerHTML = `${hours}h ${minutes}m ${seconds}s`;
    }
  }

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

// -------------------------------------------------------------
// 6. MODAL INTERACTION HANDLERS
// -------------------------------------------------------------

if (bidButton) {
  bidButton.addEventListener("click", () => {
    clearBidInput();
    updateModalThresholdUI();
    modal.classList.add("active");
    if (bidInput) bidInput.focus();
  });
}

if (cancelButton) {
  cancelButton.addEventListener("click", () => {
    modal.classList.remove("active");
    clearBidInput();
  });
}

if (bidInput) {
  bidInput.addEventListener("input", () => {
    updateModalThresholdUI();
  });
}

window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.classList.remove("active");
    clearBidInput();
  }
});

// -------------------------------------------------------------
// 7. BID SUBMISSION HANDLER (POST /api/bids)
// -------------------------------------------------------------

if (submitButton) {
  submitButton.addEventListener("click", async () => {
    const rawInput = bidInput.value.trim();
    const amount = Number(rawInput);

    // 1. Validate numerical format
    if (rawInput === "" || Number.isNaN(amount)) {
      Swal.fire({
        icon: "error",
        title: "Invalid Bid",
        text: "Please enter a valid numeric amount.",
        confirmButtonColor: "#d4af37",
        background: "#111827",
        color: "#fff",
      }).then(() => clearBidInput());
      return;
    }

    // 2. Validate positive amount
    if (amount <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Invalid Amount",
        text: "Your bid must be greater than $ 0.",
        confirmButtonColor: "#d4af37",
        background: "#111827",
        color: "#fff",
      }).then(() => clearBidInput());
      return;
    }

    // 3. Validate bid exceeds highest bid (dynamic against live WebSocket state)
    if (amount <= highestBid) {
      Swal.fire({
        icon: "warning",
        title: "Bid Outpaced!",
        html: `Someone placed a higher bid while you were pausing. Your bid must be higher than <strong>$ ${highestBid.toLocaleString()}</strong>.`,
        confirmButtonColor: "#d4af37",
        background: "#111827",
        color: "#fff",
      });
      updateModalThresholdUI();
      return;
    }

    // 4. Validate loaded active auction reference
    if (!currentAuction || !currentAuction.id) {
      Swal.fire({
        icon: "error",
        title: "System Error",
        text: "No active auction loaded to attach bid.",
        confirmButtonColor: "#d4af37",
        background: "#111827",
        color: "#fff",
      });
      return;
    }

    submitButton.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-key": sessionData.key,
        },
        body: JSON.stringify({
          auction_id: currentAuction.id,
          amount: amount,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to submit bid to auction.");
      }

      modal.classList.remove("active");
      clearBidInput();

      Swal.fire({
        icon: "success",
        title: "You're the Highest Bidder!",
        html: `Your bid of <strong>$ ${amount.toLocaleString()}</strong> has been placed successfully.`,
        confirmButtonText: "Awesome!",
        confirmButtonColor: "#d4af37",
        background: "#111827",
        color: "#fff",
      });
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Bid Failed",
        text:
          error.message ||
          "An unexpected error occurred while placing your bid.",
        confirmButtonColor: "#d4af37",
        background: "#111827",
        color: "#fff",
      }).then(() => clearBidInput());
    } finally {
      submitButton.disabled = false;
    }
  });
}

// -------------------------------------------------------------
// 8. LOGOUT & SESSION TERMINATION
// -------------------------------------------------------------

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    Swal.fire({
      icon: "question",
      title: "Leave Auction?",
      text: "Your session will be closed.",
      showCancelButton: true,
      confirmButtonText: "Exit",
      cancelButtonText: "Stay",
      confirmButtonColor: "#d4af37",
      background: "#111827",
      color: "#fff",
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.removeItem("auction_session");
        window.location.href = "index.html";
      }
    });
  });
}

// -------------------------------------------------------------
// 9. TIME FORMATTING UTILITY
// -------------------------------------------------------------

/**
 * Formats an ISO string or Date object to Eastern Time (America/New_York).
 * @param {string|Date} dateInput
 * @returns {string} Formatted string in ET (e.g., "7/31/2026, 7:46:20 PM EDT")
 */
function formatET(dateInput) {
  if (!dateInput) return "--";
  return new Date(dateInput).toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

// Bootstrap application on page load
fetchActiveAuction();
initWebSocket();