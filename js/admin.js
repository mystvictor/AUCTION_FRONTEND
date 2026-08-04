/**
 * @fileoverview Main Admin Entry Controller
 * Handles authentication guard, WebSocket connection, global UI state,
 * modal triggers, tab navigation, and initial data orchestration.
 */

const API_BASE_URL = "https://auction-api-7d4r.onrender.com/api";
const WS_BASE_URL = "wss://auction-api-7d4r.onrender.com";

// -------------------------------------------------------------
// 1. SESSION GUARD & AUTHORIZATION
// -------------------------------------------------------------

/**
 * Checks for a valid session with admin privileges.
 * Redirects non-admins or unauthenticated users to index.html.
 */
function checkAdminGuard() {
  const stored = localStorage.getItem("auction_session");

  if (!stored) {
    window.location.href = "index.html";
    return null;
  }

  try {
    const session = JSON.parse(stored);

    // Deny access if session key is missing or is_admin is false
    if (!session || !session.key || !session.is_admin) {
      localStorage.removeItem("auction_session");
      window.location.href = "index.html";
      return null;
    }

    return session;
  } catch (e) {
    console.error("[Auth Error] Failed to parse auction_session JSON", e);
    localStorage.removeItem("auction_session");
    window.location.href = "index.html";
    return null;
  }
}

// Execute guard immediately upon file execution
const currentAdminSession = checkAdminGuard();

/**
 * Generates authorization headers dynamically on every request.
 */
function getAuthHeaders() {
  const session = checkAdminGuard();
  return {
    "Content-Type": "application/json",
    "x-session-key": session ? session.key : "",
  };
}

// Helper: Eastern Time Formatter
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

// -------------------------------------------------------------
// 2. DOM ELEMENTS & STATE
// -------------------------------------------------------------
let socket = null;
let activeAuctionData = null;
let liveCountdownInterval = null;

// Realtime Monitor DOM
const wsStatus = document.getElementById("wsStatus");
const liveTitle = document.getElementById("liveTitle");
const liveDescription = document.getElementById("liveDescription");
const liveImage = document.getElementById("liveImage");
const livePrice = document.getElementById("livePrice");
const liveBidCount = document.getElementById("liveBidCount");
const liveCountdown = document.getElementById("liveCountdown");

// Navigation & Modals DOM
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const auctionModal = document.getElementById("auctionModal");
const sessionModal = document.getElementById("sessionModal");
const detailsModal = document.getElementById("detailsModal");
const sessionDetailsModal = document.getElementById("sessionDetailsModal");
const createAuctionBtn = document.getElementById("createAuctionBtn");
const createSessionBtn = document.getElementById("createSessionBtn");
const logoutBtn = document.getElementById("logoutBtn");

// -------------------------------------------------------------
// 3. WEBSOCKET REALTIME STREAM
// -------------------------------------------------------------
function initAdminWebSocket() {
  socket = new WebSocket(WS_BASE_URL);

  socket.onopen = () => {
    if (wsStatus) {
      wsStatus.textContent = "Live Connected";
      wsStatus.className = "ws-badge connected";
    }
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === "AUCTION_INIT") {
        updateLiveMonitor(message.data);
        if (typeof fetchAuctions === "function") fetchAuctions();
      }

      if (message.type === "NEW_BID") {
        const newBid = Number(message.data.highest_bid);
        if (livePrice) livePrice.textContent = "$ " + newBid.toLocaleString();

        // Dynamically update live bid counter from payload
        if (liveBidCount && message.data.bid_count !== undefined) {
          liveBidCount.textContent = message.data.bid_count;
        }

        if (livePrice) {
          livePrice.style.color = "#10b981";
          setTimeout(() => (livePrice.style.color = "#d4af37"), 600);
        }

        if (typeof fetchAuctions === "function") fetchAuctions();
        if (typeof fetchBids === "function") fetchBids();
      }

      if (message.type === "AUCTION_CLOSED") {
        if (typeof fetchAuctions === "function") fetchAuctions();
      }
    } catch (err) {
      console.error("[WebSocket Error]", err);
    }
  };

  socket.onclose = () => {
    if (wsStatus) {
      wsStatus.textContent = "Disconnected";
      wsStatus.className = "ws-badge disconnected";
    }
    setTimeout(initAdminWebSocket, 3000);
  };
}

function updateLiveMonitor(auction) {
  if (!auction) {
    if (liveTitle) liveTitle.textContent = "No active auction running.";
    if (liveDescription)
      liveDescription.textContent = "Create or activate an auction below.";
    if (livePrice) livePrice.textContent = "$ --";
    if (liveBidCount) liveBidCount.textContent = "--";
    if (liveCountdown) liveCountdown.textContent = "--:--:--";
    return;
  }

  activeAuctionData = auction;
  if (liveTitle) liveTitle.textContent = auction.title;
  if (liveDescription) liveDescription.textContent = auction.description;
  if (liveImage) liveImage.src = auction.image_url;

  const priceVal =
    Number(auction.highest_bid) > 0
      ? auction.highest_bid
      : auction.starting_bid;
  if (livePrice)
    livePrice.textContent = "$ " + Number(priceVal).toLocaleString();

  if (liveBidCount) {
    liveBidCount.textContent =
      auction.bid_count ?? auction.total_bids ?? auction.bids_count ?? 0;
  }

  startLiveCountdown(new Date(auction.end_time));
}

function startLiveCountdown(endTime) {
  if (liveCountdownInterval) clearInterval(liveCountdownInterval);

  function update() {
    const diff = endTime - new Date();
    if (diff <= 0) {
      if (liveCountdown) liveCountdown.textContent = "Closed";
      clearInterval(liveCountdownInterval);
      return;
    }
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    if (liveCountdown) liveCountdown.textContent = `${h}h ${m}m ${s}s`;
  }
  update();
  liveCountdownInterval = setInterval(update, 1000);
}

// -------------------------------------------------------------
// 4. UI MODALS & NAVIGATION
// -------------------------------------------------------------
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add("active");

    if (
      btn.dataset.tab === "bidsTab" &&
      typeof window.fetchBids === "function"
    ) {
      window.fetchBids();
    }
  });
});

if (createAuctionBtn) {
  createAuctionBtn.addEventListener("click", () => {
    const form = document.getElementById("auctionForm");
    if (form) form.reset();
    const auctionIdInput = document.getElementById("auctionId");
    if (auctionIdInput) auctionIdInput.value = "";
    const modalTitle =
      document.getElementById("modalTitle") ||
      document.getElementById("auctionModalTitle");
    if (modalTitle) modalTitle.textContent = "Create Auction";
    if (auctionModal) auctionModal.classList.add("active");
  });
}

if (createSessionBtn) {
  createSessionBtn.addEventListener("click", () => {
    const form = document.getElementById("sessionForm");
    if (form) form.reset();
    const sessionTitle = document.getElementById("sessionModalTitle");
    if (sessionTitle) sessionTitle.textContent = "Generate Session Key";
    if (sessionModal) sessionModal.classList.add("active");
  });
}

const closeModals = () => {
  if (auctionModal) auctionModal.classList.remove("active");
  if (sessionModal) sessionModal.classList.remove("active");
  if (detailsModal) detailsModal.classList.remove("active");
  if (sessionDetailsModal) sessionDetailsModal.classList.remove("active");
};

document.querySelectorAll(".close-modal").forEach((btn) => {
  btn.addEventListener("click", closeModals);
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("auction_session");
    window.location.href = "index.html";
  });
}

// -------------------------------------------------------------
// 5. BOOTSTRAP INIT
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (typeof fetchAuctions === "function") fetchAuctions();
  if (typeof fetchBids === "function") fetchBids();
  if (typeof fetchSessions === "function") fetchSessions();
  initAdminWebSocket();
});

// Export globals for module files
window.API_BASE_URL = API_BASE_URL;
window.WS_BASE_URL = WS_BASE_URL;
window.getAuthHeaders = getAuthHeaders;
window.formatET = formatET; // Keep formatET as it's used by other modules
window.closeModals = closeModals;
