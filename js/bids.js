/**
 * @fileoverview Bids Module
 * Handles loading and rendering bid streams in the main Bid History tab
 * and within individual auction detail modals.
 */

const bidsTableBody = document.getElementById("bidsTableBody");

/**
 * Fetch historical bids for active auctions.
 */
async function fetchBids() {
  const targetBody = document.getElementById("bidsTableBody");
  if (!targetBody) return;

  try {
    const response = await fetch(`${API_BASE_URL}/bids`, {
      headers: typeof getAuthHeaders === "function" ? getAuthHeaders() : {},
    });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error);

    renderBidsTable(result.data || []);
  } catch (err) {
    targetBody.innerHTML = `<tr><td colspan="4" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

/**
 * Renders the main Bid History catalog table.
 * Alignment Schema:
 * - Auction Title: Left
 * - Bidder Session Key: Left
 * - Amount: Right
 * - Timestamp: Left
 */
function renderBidsTable(bids) {
  const targetBody = document.getElementById("bidsTableBody");
  if (!targetBody) return;

  if (!bids || bids.length === 0) {
    targetBody.innerHTML = `<tr><td colspan="4" class="loading-cell">No bids recorded for active auctions yet.</td></tr>`;
    return;
  }

  targetBody.innerHTML = bids
    .map(
      (b) => `
    <tr>
      <td class="col-left"><strong>${b.auction_title || b.auctionTitle || "Auction #" + (b.auction_id || b.auctionId || "--")}</strong></td>
      <td class="col-left"><code>${b.session_key || b.sessionKey || "--"}</code></td>
      <td class="col-right">$ ${Number(b.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="col-right">${typeof formatET === "function" ? formatET(b.created_at || b.timestamp) : b.created_at}</td>
    </tr>
  `,
    )
    .join("");
}

/**
 * Renders the bid list within the single Auction Details Modal.
 * Alignment Schema:
 * - Bidder Session Key: Left
 * - Amount: Right
 * - Timestamp: Left
 */
function renderDetailsBidsTable(bids) {
  const modalBidsTableBody = document.getElementById("detailsBidsTableBody");
  if (!modalBidsTableBody) return;

  if (!bids || bids.length === 0) {
    modalBidsTableBody.innerHTML = `<tr><td colspan="3" class="loading-cell">No bids placed yet.</td></tr>`;
    return;
  }

  modalBidsTableBody.innerHTML = bids
    .map(
      (b) => `
    <tr>
      <td class="col-left"><code>${b.session_key}</code></td>
      <td class="col-right">$ ${Number(b.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="col-right">${typeof formatET === "function" ? formatET(b.created_at) : b.created_at}</td>
    </tr>
  `,
    )
    .join("");
}

// Global scope exports for inline DOM handlers
window.fetchBids = fetchBids;
window.renderBidsTable = renderBidsTable;
window.renderDetailsBidsTable = renderDetailsBidsTable;
