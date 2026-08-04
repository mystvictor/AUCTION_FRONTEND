/**
 * @fileoverview Auctions Module
 * Handles auction catalog table rendering, modal form editing/creation,
 * and viewing detailed bid history per auction.
 */

const auctionsTableBody = document.getElementById("auctionsTableBody");
const auctionForm = document.getElementById("auctionForm");

let startPicker = null;
let endPicker = null;

document.addEventListener("DOMContentLoaded", () => {
  initDatePickers();
  initCustomSelect();
  initModalListeners();
});

/**
 * Initialize Flatpickr for modern date/time picking.
 */
function initDatePickers() {
  const flatpickrConfig = {
    enableTime: true,
    dateFormat: "Y-m-d H:i",
    altInput: true,
    altFormat: "F j, Y at h:i K",
    theme: "dark",
    time_24hr: false,
  };

  startPicker = flatpickr("#startTime", {
    ...flatpickrConfig,
    onChange: function (selectedDates) {
      if (endPicker && selectedDates[0]) {
        endPicker.set("minDate", selectedDates[0]);
      }
    },
  });

  endPicker = flatpickr("#endTime", flatpickrConfig);
}

/**
 * Initialize custom status dropdown behavior.
 */
function initCustomSelect() {
  const customSelect = id("customStatusSelect");
  const trigger = id("statusSelectTrigger");
  const options = document.querySelectorAll(".custom-option");
  const hiddenInput = id("auctionStatus");
  const triggerText = id("statusTriggerText");
  const triggerIndicator = trigger
    ? trigger.querySelector(".status-indicator")
    : null;

  if (!customSelect || !trigger) return;

  // Toggle Dropdown
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    customSelect.classList.toggle("open");
  });

  // Option Selection
  options.forEach((opt) => {
    opt.addEventListener("click", () => {
      const val = opt.getAttribute("data-value");
      const label = opt.textContent.trim();

      options.forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");

      hiddenInput.value = val;
      triggerText.textContent = label;

      if (triggerIndicator) {
        triggerIndicator.className = `status-indicator status-${val}`;
      }

      customSelect.classList.remove("open");
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    customSelect.classList.remove("open");
  });
}

/**
 * Set custom status dropdown value programmatically.
 */
function setStatusSelectValue(value) {
  const targetVal = (value || "draft").toLowerCase();
  const option = document.querySelector(
    `.custom-option[data-value="${targetVal}"]`,
  );
  if (option) {
    option.click();
  } else {
    id("auctionStatus").value = targetVal;
  }
}

/**
 * Attach open/close modal event listeners.
 */
function initModalListeners() {
  const createBtn = id("createAuctionBtn");
  const closeBtn = id("closeAuctionModal");
  const cancelBtn = id("cancelAuctionBtn");
  const modal = id("auctionModal");

  if (createBtn) {
    createBtn.addEventListener("click", () => {
      resetAuctionModal();
      openAuctionModal();
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeAuctionModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeAuctionModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAuctionModal();
    });
  }
}

function openAuctionModal() {
  const modal = id("auctionModal");
  if (modal) modal.classList.add("active");
}

function closeAuctionModal() {
  const modal = id("auctionModal");
  if (modal) modal.classList.remove("active");
}

function resetAuctionModal() {
  if (auctionForm) auctionForm.reset();
  id("auctionId").value = "";
  id("modalTitle").textContent = "Create New Auction";

  if (startPicker) startPicker.clear();
  if (endPicker) endPicker.clear();

  setStatusSelectValue("draft");
}

/**
 * Fetch all auctions from the REST API.
 */
async function fetchAuctions() {
  if (!auctionsTableBody) return;

  try {
    const response = await fetch(`${API_BASE_URL}/auctions`, {
      headers: getAuthHeaders(),
    });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error);

    renderAuctionsTable(result.data || []);
  } catch (err) {
    auctionsTableBody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

/**
 * Render the main auction catalog table.
 * Conditional logic:
 * - Draft -> Show Edit button
 * - Active / Completed / Ended -> Show Details button
 */
function renderAuctionsTable(auctions) {
  if (auctions.length === 0) {
    auctionsTableBody.innerHTML = `<tr><td colspan="7" class="loading-cell">No auctions found.</td></tr>`;
    return;
  }

  auctionsTableBody.innerHTML = auctions
    .map((a) => {
      const status = (a.status || "draft").toLowerCase();

      let statusDot = "";
      if (status === "active") {
        statusDot = `<span class="dot-only dot-active" title="Active"></span>`;
      } else if (status === "draft") {
        statusDot = `<span class="dot-only dot-draft" title="Draft"></span>`;
      } else if (status === "completed" || status === "ended") {
        statusDot = `<span class="dot-only dot-completed" title="Ended"></span>`;
      } else {
        statusDot = `<span class="dot-only dot-draft" title="${status}"></span>`;
      }

      let actionButton = "";
      if (status === "draft") {
        actionButton = `<button class="btn btn-secondary btn-sm" onclick="openEditAuction('${a.id}')">Edit</button>`;
      } else {
        actionButton = `<button class="btn btn-secondary btn-sm" onclick="viewAuctionDetails('${a.id}')">Details</button>`;
      }

      const startingBid = Number(a.starting_bid || 0).toLocaleString();
      const highestBid = Number(a.highest_bid || 0);
      const highestBidDisplay =
        highestBid > 0 ? `$ ${highestBid.toLocaleString()}` : "$ --";

      return `
        <tr>
          <td class="col-center">
            <img src="${a.image_url || "images/painting.jpeg"}" class="table-thumb" alt="${a.title}">
          </td>
          <td class="col-center">${statusDot}</td>
          <td class="col-left"><strong>${a.title}</strong></td>
          <td class="col-right">$ ${startingBid}</td>
          <td class="col-right">${highestBidDisplay}</td>
          <td class="col-right">${typeof formatET === "function" ? formatET(a.end_time) : a.end_time}</td>
          <td class="col-center">
            <div class="action-group justify-center">
              ${actionButton}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

/**
 * Open details modal for a single auction.
 */
async function viewAuctionDetails(auctionId) {
  try {
    const auctionRes = await fetch(`${API_BASE_URL}/auctions/${auctionId}`, {
      headers: getAuthHeaders(),
    });
    const auctionData = await auctionRes.json();
    if (!auctionRes.ok) throw new Error(auctionData.error);

    const a = auctionData.data;

    id("detailsTitle").textContent = a.title;
    id("detailsDescription").textContent =
      a.description || "No description provided.";
    id("detailsImage").src = a.image_url || "images/painting.jpeg";

    id("detailsStartTime").textContent =
      typeof formatET === "function"
        ? formatET(a.start_time || a.created_at)
        : a.start_time;
    id("detailsStartingBid").textContent =
      `$ ${Number(a.starting_bid || 0).toLocaleString()}`;
    id("detailsEndTime").textContent =
      typeof formatET === "function" ? formatET(a.end_time) : a.end_time;
    id("detailsHighestBid").textContent =
      Number(a.highest_bid) > 0
        ? `$ ${Number(a.highest_bid).toLocaleString()}`
        : "$ --";

    const winnerCard = id("winnerInfoCard");
    const bidsSection = id("detailsBidsSection");

    const detailsModal = id("detailsModal");
    if (detailsModal) detailsModal.classList.add("active");

    // Logic to show winner details OR bid history
    if (a.status === "completed" && a.winning_bid_details) {
      winnerCard.style.display = "block";
      bidsSection.style.display = "none";
      lucide.createIcons(); // Re-render Lucide icons

      const details = a.winning_bid_details;
      id("winnerAmount").textContent = `$ ${Number(details.amount).toLocaleString()}`;
      id("winnerName").textContent = details.contact_name;
      id("winnerEmail").textContent = details.contact_email;
      id("winnerPhone").textContent = details.contact_phone;
    } else {
      winnerCard.style.display = "none";
      bidsSection.style.display = "block";

      const bidsTableBody = id("detailsBidsTableBody");
      if (bidsTableBody) {
        bidsTableBody.innerHTML = `<tr><td colspan="3" class="loading-cell">Loading bids...</td></tr>`;
      }

      const bidsRes = await fetch(
        `${API_BASE_URL}/auctions/${auctionId}/bids?limit=5`,
        {
          headers: getAuthHeaders(),
        },
      );

      if (bidsRes.ok) {
        const bidsData = await bidsRes.json();
        renderDetailsBidsTable(bidsData.data || []);
      } else if (bidsTableBody) {
        bidsTableBody.innerHTML = `<tr><td colspan="3" class="loading-cell">No bid history found.</td></tr>`;
      }
    }
  } catch (err) {
    Swal.fire({ icon: "error", title: "Error", text: err.message });
  }
}

function renderDetailsBidsTable(bids) {
  const target = id("detailsBidsTableBody");
  if (!target) return;

  if (!bids || bids.length === 0) {
    target.innerHTML = `<tr><td colspan="3" class="loading-cell">No bids placed yet.</td></tr>`;
    return;
  }

  target.innerHTML = bids
    .map(
      (b) => `
    <tr>
      <td class="col-left">${typeof formatET === "function" ? formatET(b.created_at) : b.created_at}</td>
      <td class="col-center"><code>${b.session_key}</code></td>
      <td class="col-right"><strong>$ ${Number(b.amount).toLocaleString()}</strong></td>
    </tr>
  `,
    )
    .join("");
}

/**
 * Populate edit modal for draft auctions.
 */
async function openEditAuction(auctionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/auctions/${auctionId}`, {
      headers: getAuthHeaders(),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    const a = result.data;
    id("auctionId").value = a.id;
    id("auctionTitle").value = a.title || "";
    id("auctionDescription").value = a.description || "";
    id("auctionImageUrl").value = a.image_url || "";
    id("startingBid").value = a.starting_bid || 0;

    if (startPicker && a.start_time) {
      startPicker.setDate(new Date(a.start_time), true);
    }
    if (endPicker && a.end_time) {
      endPicker.setDate(new Date(a.end_time), true);
    }

    setStatusSelectValue(a.status || "draft");

    id("modalTitle").textContent = "Edit Auction";
    openAuctionModal();
  } catch (err) {
    Swal.fire({ icon: "error", title: "Error", text: err.message });
  }
}

/**
 * Save / Update Auction Form Submission
 */
if (auctionForm) {
  auctionForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const auctionId = id("auctionId").value;
    const startDates = startPicker ? startPicker.selectedDates : [];
    const endDates = endPicker ? endPicker.selectedDates : [];

    if (startDates.length === 0 || endDates.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Missing Dates",
        text: "Please select both start and end times.",
      });
      return;
    }

    const payload = {
      title: id("auctionTitle").value,
      description: id("auctionDescription").value,
      image_url:
        transformGoogleDriveUrl(id("auctionImageUrl").value) ||
        "images/painting.jpeg",
      starting_bid: Number(id("startingBid").value),
      status: id("auctionStatus").value,
      start_time: startDates[0].toISOString(),
      end_time: endDates[0].toISOString(),
    };

    const method = auctionId ? "PATCH" : "POST";
    const url = auctionId
      ? `${API_BASE_URL}/auctions/${auctionId}`
      : `${API_BASE_URL}/auctions`;

    try {
      const response = await fetch(url, {
        method: method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      closeAuctionModal();
      fetchAuctions();

      Swal.fire({
        icon: "success",
        title: auctionId ? "Auction Updated" : "Auction Created",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Operation Failed",
        text: err.message,
      });
    }
  });
}

/**
 * Transforms a standard Google Drive sharing URL into a direct image link.
 * @param {string} url - The original URL from the input field.
 * @returns {string} The transformed direct link or the original URL if not a GDrive link.
 */
function transformGoogleDriveUrl(url) {
  if (url && url.includes("drive.google.com/file/d/")) {
    const fileId = url.split("/d/")[1].split("/")[0];
    if (fileId) {
      console.log(`[URL Transform] Converted Google Drive link for file ID: ${fileId}`);
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  }
  // Return original URL if it's not a recognizable GDrive link
  return url;
}

function id(elementId) {
  return document.getElementById(elementId);
}

// Global scope exports for inline DOM handlers
window.fetchAuctions = fetchAuctions;
window.viewAuctionDetails = viewAuctionDetails;
window.openEditAuction = openEditAuction;
