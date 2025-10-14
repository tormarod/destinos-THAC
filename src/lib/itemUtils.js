// src/lib/itemUtils.js
// Item utility functions for popularity analysis, blocking, and centro management

/**
 * Get most desired items based on first preferences
 * Analyzes user submissions to find the most popular destinations
 */
function getMostDesiredItems(submissions, maxItems = 10) {
  const firstPreferenceCounts = {};

  submissions.forEach((user) => {
    const rankedItems = user.rankedItems || [];
    if (rankedItems.length > 0) {
      const firstPref = String(rankedItems[0]);
      firstPreferenceCounts[firstPref] =
        (firstPreferenceCounts[firstPref] || 0) + 1;
    }
  });

  // Sort by first preference count and return top items
  return Object.entries(firstPreferenceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([item, count]) => item);
}

/**
 * Get items from most popular centros (placeholder implementation)
 * This function is kept for backward compatibility but returns empty array
 * The proper implementation is getItemsFromPopularCentrosWithItems
 */
async function getItemsFromPopularCentrosSync(submissions, maxCentros = 3) {
  // We need to get the items data to access centro information
  // For now, return empty array - this will be implemented properly
  // when we have access to the items data in the allocation context
  return [];
}

/**
 * Get items from most popular centros (proper implementation with items data)
 * Analyzes user preferences by centro and returns items from the most popular centros
 */
function getItemsFromPopularCentrosWithItems(
  submissions,
  items,
  maxCentros = 3,
) {
  // Group items by centro de destino
  const itemsByCentro = {};
  items.forEach((item) => {
    const centro = item["Centro de destino"] || "Sin centro";
    const itemId = item["Vacante"];
    if (itemId && typeof itemId === "number") {
      if (!itemsByCentro[centro]) {
        itemsByCentro[centro] = [];
      }
      itemsByCentro[centro].push(String(itemId));
    }
  });

  // Analyze first preferences by centro
  const centroFirstPreferences = {};
  submissions.forEach((user) => {
    const rankedItems = user.rankedItems || [];
    if (rankedItems.length > 0) {
      const firstPref = String(rankedItems[0]);
      const item = items.find((i) => i["Vacante"] == firstPref);
      if (item && item["Centro de destino"]) {
        const centro = item["Centro de destino"];
        centroFirstPreferences[centro] =
          (centroFirstPreferences[centro] || 0) + 1;
      }
    }
  });

  // Get top centros by first preferences
  const topCentros = Object.entries(centroFirstPreferences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCentros);

  // Return all items from top centros
  const result = [];
  topCentros.forEach(([centro, count]) => {
    const centroItems = itemsByCentro[centro] || [];
    result.push(...centroItems);
  });

  return result;
}

/**
 * Get blocked item IDs based on selected localidades and centros
 * Filters items that match the blocked criteria for scenario 2
 */
function getBlockedItemIds(items, blockedItems) {
  const { selectedLocalidades = [], selectedCentros = [] } = blockedItems;

  if (selectedLocalidades.length === 0 && selectedCentros.length === 0) {
    return [];
  }

  return items
    .filter((item) => {
      const localidadMatch =
        selectedLocalidades.length === 0 ||
        selectedLocalidades.includes(item.Localidad);
      const centroMatch =
        selectedCentros.length === 0 ||
        selectedCentros.includes(item["Centro de destino"]);
      return localidadMatch && centroMatch;
    })
    .map((item) => String(item.Vacante));
}

module.exports = {
  getMostDesiredItems,
  getItemsFromPopularCentrosSync,
  getItemsFromPopularCentrosWithItems,
  getBlockedItemIds,
};
