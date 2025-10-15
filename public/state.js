// public/state.js
// Application state management and version control

/**
 * Global application state
 * Contains all the data needed for the allocation system
 */
const state = {
  idField: "Vacante", // Field name for item identification
  season: null, // Current selected season
  items: [], // Available items for the season
  itemsById: new Map(), // Fast lookup map for items by ID
  ranking: [], // User's current ranking/preferences
  quota: 0, // User's quota (number of items they can select)
  maxClickable: 9999999, // Maximum number of clickable items
  maxItemsTable: 9999999, // Maximum items to display in table
  searchTerm: "", // Current search filter
  page: 1, // Current page for pagination
  pageSize: 10, // Items per page
  yearsAbove: 0, // Years above current year to allow
  yearsBelow: 0, // Years below current year to allow
  blockedItems: { selectedLocalidades: [], selectedCentros: [] }, // Blocked items for scenario 2
  competitionDepth: 1, // Competition depth for scenario 3
};

/**
 * Version check to force refresh after deployment
 * Compares server-injected version with localStorage version
 */
const STORAGE_KEY = "allocator:version";

function checkVersionAndRefresh() {
  // Get the current version from the server-injected variable
  const currentVersion = window.APP_VERSION || "1.0.0";
  const storedVersion = localStorage.getItem(STORAGE_KEY);

  if (storedVersion && storedVersion !== currentVersion) {
    console.log(
      `Version changed from ${storedVersion} to ${currentVersion}. Refreshing...`,
    );
    localStorage.setItem(STORAGE_KEY, currentVersion);
    window.location.reload();
    return;
  }
  localStorage.setItem(STORAGE_KEY, currentVersion);
}

/**
 * Check if changelog should be shown for current version
 * Returns true if user hasn't seen the changelog for current version
 */
function shouldShowChangelog() {
  const currentVersion = window.APP_VERSION || "1.0.0";
  const lastSeenVersion = localStorage.getItem("allocator:changelogSeen");
  
  return lastSeenVersion !== currentVersion;
}

// Make state accessible globally for other scripts
window.state = state;

// Local storage keys for persistence
const LOCAL_KEY = "allocator:userId";
const SEASON_KEY = "allocator:season";
const LAST_SUBMIT_TIME_KEY = "allocator:lastSubmitTime";

// Export for use by other modules
window.stateModule = {
  state,
  checkVersionAndRefresh,
  shouldShowChangelog,
  STORAGE_KEY,
  LOCAL_KEY,
  SEASON_KEY,
  LAST_SUBMIT_TIME_KEY,
};
