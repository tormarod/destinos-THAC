// public/utils.js
// Utility functions for the allocation system

/**
 * Normalize order value to integer
 * Converts string input to valid integer order
 */
function normalizeOrder(v) {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 1 ? null : n;
}

/**
 * Check if order is already taken remotely
 * Validates order availability before submission
 */
async function isOrderTakenRemote(order) {
  try {
    const response = await fetch(`/api/orders?season=${window.state.season}&order=${order}`);
    const data = await response.json();
    return { taken: data.taken || false };
  } catch (error) {
    console.error("Error checking order:", error);
    return { taken: false };
  }
}

/**
 * Fetch current state from server
 * Loads user submissions and updates local state
 */
async function fetchState() {
  try {
    // Get user ID from localStorage or form
    const userId = getLocalUserId() || document.getElementById("userId")?.value;
    const url = userId ? `/api/state?season=${window.state.season}&userId=${userId}` : `/api/state?season=${window.state.season}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    // The API returns submissions array, we need to find the user's submission
    const userSubmission = data.submissions && data.submissions.length > 0 ? data.submissions[0] : null;
    
    if (userSubmission) {
      window.state.ranking = userSubmission.rankedItems || [];
      const nameEl = document.getElementById("name");
      const orderEl = document.getElementById("order");
      if (nameEl) nameEl.value = userSubmission.name || "";
      if (orderEl) orderEl.value = userSubmission.order || "";
      window.state.quota = userSubmission.order || 0;
    } else {
      // Clear user data if no submission found
      window.state.ranking = [];
      const nameEl = document.getElementById("name");
      const orderEl = document.getElementById("order");
      if (nameEl) nameEl.value = "";
      if (orderEl) orderEl.value = "";
      window.state.quota = 0;
    }
    
    return data;
  } catch (error) {
    console.error("Error fetching state:", error);
    return null;
  }
}

/**
 * Get local user ID from localStorage
 * Retrieves stored user ID for persistence
 */
function getLocalUserId() {
  return localStorage.getItem(window.stateModule.LOCAL_KEY);
}

/**
 * Set local user ID in localStorage
 * Stores user ID for future sessions
 */
function setLocalUserId(userId) {
  localStorage.setItem(window.stateModule.LOCAL_KEY, userId);
}

/**
 * Clear local user ID from localStorage
 * Removes stored user ID
 */
function clearLocalUserId() {
  localStorage.removeItem(window.stateModule.LOCAL_KEY);
}

/**
 * Get current season from localStorage or default
 * Returns the selected season
 */
function getSeason() {
  return localStorage.getItem(window.stateModule.SEASON_KEY) || new Date().getFullYear().toString();
}

/**
 * Set page number for pagination
 * Updates current page in state
 */
function setPage(page) {
  window.state.page = parseInt(page, 10);
  window.uiModule.renderClickableItems();
}

// Export functions for use by other modules
window.utilsModule = {
  normalizeOrder,
  isOrderTakenRemote,
  fetchState,
  getLocalUserId,
  setLocalUserId,
  clearLocalUserId,
  getSeason,
  setPage,
};
