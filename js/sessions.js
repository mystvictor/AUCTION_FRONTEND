/**
 * Helper to convert JavaScript Date object or ISO string to local HTML datetime-local format
 */
function toDatetimeLocalString(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

/**
 * Ensures key is strictly 6 numeric digits
 */
function sanitizeSessionKey(inputKey) {
  const digitsOnly = String(inputKey || "").replace(/\D/g, "");
  if (digitsOnly.length === 6) return digitsOnly;
  if (digitsOnly.length > 6) return digitsOnly.slice(0, 6);
  if (digitsOnly.length > 0) return digitsOnly.padStart(6, "0");
  
  // Fallback generation of guaranteed 6-digit string
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Safely reference sessionForm DOM element
const sessionForm = document.getElementById("sessionForm");
let expiresPicker = null;

document.addEventListener("DOMContentLoaded", () => {
  initSessionDatePicker();
});

/**
 * Initialize Flatpickr for session expiration date picking
 */
function initSessionDatePicker() {
  const expiresInput = document.getElementById("expiresAtInput");
  if (!expiresInput) return;

  expiresPicker = flatpickr("#expiresAtInput", {
    enableTime: true,
    dateFormat: "Y-m-d H:i",
    altInput: true,
    altFormat: "F j, Y at h:i K",
    theme: "dark",
    time_24hr: false,
  });
}

/**
 * Handle Session Form Submission (Create or Edit)
 */
if (sessionForm) {
  sessionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const originalKey = document.getElementById("sessionIdInput")?.value || "";
    const rawKey = document.getElementById("sessionKeyInput")?.value.trim() || "";
    const contactName = document.getElementById("contactNameInput")?.value.trim() || "";
    const contactEmail = document.getElementById("contactEmailInput")?.value.trim() || "";
    const contactPhone = document.getElementById("contactPhoneInput")?.value.trim() || "";
    
    // Strict 6-digit code enforcement
    const cleanKey = sanitizeSessionKey(rawKey);

    // Retrieve ISO string from Flatpickr instance or fallback
    let expiresAt = null;
    if (expiresPicker && expiresPicker.selectedDates.length > 0) {
      expiresAt = expiresPicker.selectedDates[0].toISOString();
    } else {
      const rawVal = document.getElementById("expiresAtInput")?.value;
      if (rawVal && !isNaN(new Date(rawVal).getTime())) {
        expiresAt = new Date(rawVal).toISOString();
      }
    }

    const isActive = document.getElementById("activeCheckbox")?.checked ?? true;
    const isAdmin = document.getElementById("adminCheckbox")?.checked ?? false;

    const payload = {
      key: cleanKey,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      expires_at: expiresAt,
      active: isActive,
      is_admin: isAdmin,
    };

    const isEdit = Boolean(originalKey);
    // Target /api/sessions/:key for PATCH, or /api/sessions for POST
    const endpoint = isEdit ? `${API_BASE_URL}/sessions/${originalKey}` : `${API_BASE_URL}/sessions`;
    const method = isEdit ? "PATCH" : "POST";

    const authHeaders = typeof getAuthHeaders === "function" ? getAuthHeaders() : {};

    try {
      const response = await fetch(endpoint, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || "Failed to save session");

      if (typeof closeModals === "function") closeModals();
      if (typeof fetchSessions === "function") fetchSessions();

      Swal.fire({
        icon: "success",
        title: isEdit ? "Session Updated" : "Session Key Created",
        text: `Key: ${payload.key}`,
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Operation Failed", text: err.message });
    }
  });
}

/**
 * Open Edit Modal for Session metadata by 6-digit KEY
 */
async function openEditSession(key) {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${key}`, {
      headers: typeof getAuthHeaders === "function" ? getAuthHeaders() : {},
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || result.message || "Could not retrieve session");

    const s = result.data || result;

    const sessionIdInput = document.getElementById("sessionIdInput");
    const keyInput = document.getElementById("sessionKeyInput");
    const nameInput = document.getElementById("contactNameInput");
    const emailInput = document.getElementById("contactEmailInput");
    const phoneInput = document.getElementById("contactPhoneInput");
    const activeCheck = document.getElementById("activeCheckbox");
    const adminCheck = document.getElementById("adminCheckbox");

    // Store current key in hidden input to know which key to PATCH on submit
    if (sessionIdInput) sessionIdInput.value = s.key || key;
    if (keyInput) keyInput.value = sanitizeSessionKey(s.key || key);
    if (nameInput) nameInput.value = s.contact_name || "";
    if (emailInput) emailInput.value = s.contact_email || "";
    if (phoneInput) phoneInput.value = s.contact_phone || "";
    
    if (activeCheck) activeCheck.checked = s.active !== false;
    if (adminCheck) adminCheck.checked = s.is_admin === true;

    if (s.expires_at) {
      if (expiresPicker) {
        expiresPicker.setDate(new Date(s.expires_at), true);
      } else {
        const expiresInput = document.getElementById("expiresAtInput");
        if (expiresInput) expiresInput.value = toDatetimeLocalString(s.expires_at);
      }
    } else {
      if (expiresPicker) expiresPicker.clear();
      const expiresInput = document.getElementById("expiresAtInput");
      if (expiresInput) expiresInput.value = "";
    }

    const modalTitle = document.getElementById("sessionModalTitle");
    if (modalTitle) modalTitle.textContent = "Edit Session";

    const modal = document.getElementById("sessionModal");
    if (modal) modal.classList.add("active");
  } catch (err) {
    Swal.fire({ icon: "error", title: "Error", text: err.message || "Could not load session details." });
  }
}

/**
 * Open details modal for a single session.
 */
async function viewSessionDetails(key) {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${key}`, {
      headers: getAuthHeaders(),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    const s = result.data;

    // Populate the modal fields
    document.getElementById("sessionDetailKey").textContent = s.key;
    document.getElementById("sessionDetailName").textContent = s.contact_name || "--";
    document.getElementById("sessionDetailEmail").textContent = s.contact_email || "--";
    document.getElementById("sessionDetailPhone").textContent = s.contact_phone || "--";
    document.getElementById("sessionDetailCreated").textContent = formatET(s.created_at);
    document.getElementById("sessionDetailExpires").textContent = s.expires_at ? formatET(s.expires_at) : "Never";

    const statusEl = document.getElementById("sessionDetailStatus");
    if (s.active) {
      statusEl.textContent = "Active";
      statusEl.style.color = "var(--success-color)";
    } else {
      statusEl.textContent = "Inactive";
      statusEl.style.color = "var(--danger-color)";
    }

    const roleEl = document.getElementById("sessionDetailRole");
    if (s.is_admin) {
      roleEl.textContent = "Administrator";
      roleEl.style.color = "var(--gold-accent)";
    } else {
      roleEl.textContent = "Standard User";
      roleEl.style.color = "var(--text-main)";
    }

    // Show the modal
    const modal = document.getElementById("sessionDetailsModal");
    if (modal) modal.classList.add("active");

  } catch (err) {
    Swal.fire({
      icon: "error",
      title: "Failed to Load Details",
      text: err.message,
    });
  }
}

/**
 * Reset Modal fields for new session creation
 */
function resetSessionModal() {
  if (sessionForm) sessionForm.reset();
  
  const sessionIdInput = document.getElementById("sessionIdInput");
  if (sessionIdInput) sessionIdInput.value = "";

  const keyInput = document.getElementById("sessionKeyInput");
  if (keyInput) keyInput.value = sanitizeSessionKey();

  const emailInput = document.getElementById("contactEmailInput");
  if (emailInput) emailInput.value = "";

  if (expiresPicker) expiresPicker.clear();
  
  const title = document.getElementById("sessionModalTitle");
  if (title) title.textContent = "Create Session Key";

  const activeCheck = document.getElementById("activeCheckbox");
  if (activeCheck) activeCheck.checked = true;

  const adminCheck = document.getElementById("adminCheckbox");
  if (adminCheck) adminCheck.checked = false;
}

/**
 * Open Modal for creating a new session key
 */
function openCreateSession() {
  resetSessionModal();
  const modal = document.getElementById("sessionModal");
  if (modal) modal.classList.add("active");
}

/**
 * Fetch all sessions from REST API
 */
async function fetchSessions() {
  const targetBody = document.getElementById("sessionsTableBody");
  if (!targetBody) return;

  try {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      headers: typeof getAuthHeaders === "function" ? getAuthHeaders() : {},
    });
    const result = await response.json();

    if (!response.ok)
      throw new Error(result.error || result.message || "Failed to fetch sessions");

    renderSessionsTable(result.data || []);
  } catch (err) {
    targetBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

/**
 * Render sessions into table rows
 */
function renderSessionsTable(sessions) {
  const targetBody = document.getElementById("sessionsTableBody");
  if (!targetBody) return;

  if (!sessions || sessions.length === 0) {
    targetBody.innerHTML = `<tr><td colspan="7" class="loading-cell">No active sessions found.</td></tr>`;
    return;
  }

  targetBody.innerHTML = sessions
    .map((s) => {
      const activeDot =
        s.active !== false
          ? `<span class="dot-only dot-active" title="Active"></span>`
          : `<span class="dot-only dot-inactive" title="Inactive"></span>`;

      const adminDot = s.is_admin
        ? `<span class="dot-only dot-admin" title="Admin"></span>`
        : `<span class="dot-only dot-standard" title="Standard"></span>`;

      const expiration =
        typeof formatET === "function"
          ? formatET(s.expires_at)
          : s.expires_at || "Never";

      return `
        <tr class="${s.active === false ? "row-revoked" : ""}">
          <td class="col-left"><code>${s.key}</code></td>
          <td class="col-center">${activeDot}</td>
          <td class="col-center">${adminDot}</td>
          <td class="col-left">${s.contact_name || "--"}</td>
          <td class="col-left">${s.contact_phone || "--"}</td>
          <td class="col-left">${expiration}</td>
          <td class="col-center">
            <div class="action-group justify-center">
              <button class="btn btn-secondary btn-sm" onclick="openEditSession('${s.key}')">Edit</button>
              <button class="btn btn-info btn-sm" onclick="viewSessionDetails('${s.key}')">Details</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Global scope exports for inline HTML event handlers
window.fetchSessions = fetchSessions;
window.openEditSession = openEditSession;
window.openCreateSession = openCreateSession;
window.resetSessionModal = resetSessionModal;
window.viewSessionDetails = viewSessionDetails;