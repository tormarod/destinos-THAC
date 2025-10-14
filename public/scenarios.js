// public/scenarios.js
// Scenario management and location selection for the allocation system

/**
 * Populate season select dropdown with available years
 * Sets current year as default and loads season data
 */
async function populateSeasonSelect() {
  const sel = document.getElementById("seasonSelect");
  const current = Number(new Date().getFullYear());
  
  if (!sel) {
    console.error("Season select element not found");
    return;
  }

  // Ensure state is available
  if (!window.state) {
    console.error("State not available yet, retrying in 100ms");
    setTimeout(populateSeasonSelect, 100);
    return;
  }

  // Clear existing options
  sel.innerHTML = "";

  // Add current year as default
  const currentOption = document.createElement("option");
  currentOption.value = current;
  currentOption.textContent = current;
  currentOption.selected = true;
  sel.appendChild(currentOption);

  // Set initial season
  window.state.season = String(current);
  
  // Load season data
  await setSeason(String(current));
}

/**
 * Set season and load associated data
 * Updates state and fetches items for the selected season
 */
async function setSeason(season, retryCount = 0) {
  // Ensure state is available
  if (!window.state) {
    console.error("State not available yet");
    return;
  }
  
  window.state.season = String(season);
  
  try {
    // Get user ID from localStorage or form
    const userId = window.utilsModule.getLocalUserId() || document.getElementById("userId")?.value;
    const url = userId ? `/api/state?season=${season}&userId=${userId}` : `/api/state?season=${season}`;
    
    console.log(`Fetching data for season: ${season} (attempt ${retryCount + 1})${userId ? ` for user: ${userId}` : ''}`);
    console.log(`User ID sources - localStorage: ${window.utilsModule.getLocalUserId()}, form: ${document.getElementById("userId")?.value}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Received data for season ${season}:`, data);
    
    if (data.items && Array.isArray(data.items)) {
      window.state.items = data.items;
      window.state.itemsById = new Map(
        data.items.map((item) => [String(item[window.state.idField]), item])
      );
      console.log(`Loaded ${data.items.length} items for season ${season}`);
    } else {
      window.state.items = [];
      window.state.itemsById = new Map();
      console.log(`No items found for season ${season}`);
    }
    
    // Load user's existing submission data
    // The API returns submissions array, we need to find the user's submission
    const userSubmission = data.submissions && data.submissions.length > 0 ? data.submissions[0] : null;
    
    if (userSubmission) {
      window.state.ranking = userSubmission.rankedItems || [];
      const nameEl = document.getElementById("name");
      const orderEl = document.getElementById("order");
      if (nameEl) nameEl.value = userSubmission.name || "";
      if (orderEl) orderEl.value = userSubmission.order || "";
      window.state.quota = userSubmission.order || 0;
      console.log(`Loaded user submission for season ${season}:`, userSubmission);
    } else {
      // Clear user data if no submission found
      window.state.ranking = [];
      const nameEl = document.getElementById("name");
      const orderEl = document.getElementById("order");
      if (nameEl) nameEl.value = "";
      if (orderEl) orderEl.value = "";
      window.state.quota = 0;
      console.log(`No user submission found for season ${season}`);
    }
    
    // Load user ID from localStorage if available
    const storedUserId = window.utilsModule.getLocalUserId();
    if (storedUserId) {
      const userIdEl = document.getElementById("userId");
      if (userIdEl) userIdEl.value = storedUserId;
      console.log(`Loaded user ID from localStorage: ${storedUserId}`);
    } else {
      // If no user ID in localStorage, check if it's in the form
      const formUserId = document.getElementById("userId")?.value;
      if (formUserId) {
        console.log(`User ID found in form: ${formUserId}`);
        // Store it in localStorage for future use
        window.utilsModule.setLocalUserId(formUserId);
      }
    }
    
    // Trigger UI updates after all data is loaded
    if (window.uiModule) {
      window.uiModule.renderClickableItems();
      window.uiModule.renderRankingTable();
      window.uiModule.updateQuotaIndicators();
    }
  } catch (error) {
    console.error("Error loading season data:", error);
    
    // Retry up to 3 times with exponential backoff
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.log(`Retrying in ${delay}ms...`);
      setTimeout(() => setSeason(season, retryCount + 1), delay);
      return;
    }
    
    // Final fallback - set empty state
    window.state.items = [];
    window.state.itemsById = new Map();
    window.state.ranking = [];
    document.getElementById("name").value = "";
    document.getElementById("order").value = "";
    window.state.quota = 0;
    console.error("Failed to load season data after 3 attempts");
    
    // Still trigger UI updates even with empty state
    if (window.uiModule) {
      window.uiModule.renderClickableItems();
      window.uiModule.renderRankingTable();
      window.uiModule.updateQuotaIndicators();
    }
  }
}

/**
 * Load location and centro options for scenario 2
 * Fetches items data and populates location selectors
 */
async function loadLocationOptions() {
  try {
    const season = new Date().getFullYear().toString();
    // Only fetch items, not user submissions, so we don't need userId parameter
    const response = await fetch(`/api/state?season=${season}`);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      populateLocationSelects(data.items);
    }
  } catch (error) {
    console.error("Error loading location options:", error);
  }
}

/**
 * Populate the location and centro select elements
 * Creates options for localidades and centros from items data
 */
function populateLocationSelects(items) {
  const localidadSelect = document.getElementById("localidadSelect");
  const centroSelect = document.getElementById("centroSelect");

  if (!localidadSelect || !centroSelect) return;

  // Get unique localidades and centros
  const localidades = [
    ...new Set(items.map((item) => item.Localidad).filter(Boolean)),
  ].sort();
  const centros = [
    ...new Set(
      items.map((item) => item["Centro de destino"]).filter(Boolean),
    ),
  ].sort();

  // Populate localidad select
  localidadSelect.innerHTML = "";
  localidades.forEach((localidad) => {
    const option = document.createElement("option");
    option.value = localidad;
    option.textContent = localidad;
    localidadSelect.appendChild(option);
  });

  // Populate centro select
  centroSelect.innerHTML = "";
  centros.forEach((centro) => {
    const option = document.createElement("option");
    option.value = centro;
    option.textContent = centro;
    centroSelect.appendChild(option);
  });
}

/**
 * Get blocked items based on selected localidades and centros
 * Filters items that match the blocked criteria for scenario 2
 */
function getBlockedItems(items, selectedLocalidades, selectedCentros) {
  return items.filter((item) => {
    const localidadMatch =
      selectedLocalidades.length === 0 ||
      selectedLocalidades.includes(item.Localidad);
    const centroMatch =
      selectedCentros.length === 0 ||
      selectedCentros.includes(item["Centro de destino"]);
    return localidadMatch && centroMatch;
  });
}

/**
 * Reload season data when user ID changes
 * This can be called when user enters their ID after initial load
 */
async function reloadSeasonData() {
  if (window.state && window.state.season) {
    console.log("Reloading season data due to user ID change");
    await setSeason(window.state.season);
  }
}

/**
 * Show blocked items preview
 * Displays a preview of items that would be blocked in scenario 2
 */
function showBlockedItemsPreview(blockedItems) {
  const previewDiv = document.getElementById("blockedItemsPreview");
  const listDiv = document.getElementById("blockedItemsList");

  if (!previewDiv || !listDiv) return;

  if (blockedItems.length === 0) {
    listDiv.innerHTML =
      "No se encontraron destinos que coincidan con la selección.";
  } else {
    const itemsList = blockedItems
      .slice(0, 20)
      .map(
        (item) =>
          `• Vacante ${item.Vacante}: ${item.Localidad} - ${item["Centro de destino"]}`,
      )
      .join("<br>");

    const moreText =
      blockedItems.length > 20
        ? `<br><em>... y ${blockedItems.length - 20} destinos más</em>`
        : "";

    listDiv.innerHTML = `${itemsList}${moreText}`;
  }

  previewDiv.style.display = "block";
}

/**
 * Get selected blocked items for allocation
 * Returns the current blocked items configuration for scenario 2
 */
function getSelectedBlockedItems() {
  return window.state.blockedItems || { selectedLocalidades: [], selectedCentros: [] };
}

// Export functions for use by other modules
window.scenariosModule = {
  populateSeasonSelect,
  setSeason,
  reloadSeasonData,
  loadLocationOptions,
  populateLocationSelects,
  getBlockedItems,
  showBlockedItemsPreview,
  getSelectedBlockedItems,
};
