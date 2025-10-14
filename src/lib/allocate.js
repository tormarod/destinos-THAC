// src/lib/allocate.js
// Core allocation algorithm and fake user generation for simulation scenarios

// Generate realistic fake submissions for missing users in scenario 1
// This creates synthetic users to fill gaps in the submission order for realistic simulation
function generateFakeSubmissions(realSubmissions, targetUserOrder) {
  const realOrders = realSubmissions.map(s => s.order).sort((a, b) => a - b);
  const minOrder = Math.min(...realOrders);
  const maxOrder = Math.max(...realOrders);
  
  // Find missing orders up to (but not including) the target user (gaps in submission sequence)
  // We need to fill gaps from order 1 to (targetUserOrder - 1), not from minOrder
  const missingOrders = [];
  for (let i = 1; i < targetUserOrder; i++) {
    if (!realOrders.includes(i)) {
      missingOrders.push(i);
    }
  }
  
  if (missingOrders.length === 0) {
    return realSubmissions; // No gaps to fill
  }
  
  // Analyze preference patterns by order ranges to generate realistic fake preferences
  // This ensures fake users have believable preference patterns based on real data
  const preferencePatterns = analyzePreferencePatterns(realSubmissions);
  
  // Generate fake submissions for missing orders
  const fakeSubmissions = missingOrders.map(missingOrder => {
    const pattern = getPreferencePatternForOrder(missingOrder, preferencePatterns);
    return {
      id: `fake_${missingOrder}`,
      userId: `fake_user_${missingOrder}`,
      name: `Usuario ${missingOrder}`,
      order: missingOrder,
      rankedItems: pattern,
      submittedAt: Date.now() - (missingOrder * 1000), // Stagger submission times for realism
      isFake: true // Mark as fake for filtering in position calculations
    };
  });
  
  // Combine real and fake submissions, sort by order
  const allSubmissions = [...realSubmissions, ...fakeSubmissions]
    .sort((a, b) => a.order - b.order);
  
  return allSubmissions;
}

// Analyze preference patterns by order ranges to generate realistic fake user preferences
// This helps create believable fake users that match the behavior patterns of real users
function analyzePreferencePatterns(submissions) {
  const patterns = {};
  
  // Define order ranges to capture different user behavior patterns
  const ranges = [
    { name: 'top50', min: 1, max: 50 },        // Early submitters (high priority)
    { name: 'orders51_100', min: 51, max: 100 }, // Mid-range submitters
    { name: 'orders101_200', min: 101, max: 200 }, // Mid-late submitters
    { name: 'orders201_300', min: 201, max: 300 }, // Late submitters
    { name: 'orders301_plus', min: 301, max: 999 } // Very late submitters
  ];
  
  ranges.forEach(range => {
    const usersInRange = submissions.filter(s => s.order >= range.min && s.order <= range.max);
    if (usersInRange.length === 0) return;
    
    // Collect all preferences in this range with weighted importance
    const allPreferences = [];
    usersInRange.forEach(user => {
      const rankedItems = user.rankedItems || [];
      rankedItems.forEach((item, index) => {
        allPreferences.push({
          item: String(item),
          position: index,
          weight: Math.max(0, 10 - index) // Higher weight for earlier positions (more important preferences)
        });
      });
    });
    
    // Calculate weighted preference frequencies (items with higher positions get more weight)
    const prefWeights = {};
    allPreferences.forEach(pref => {
      if (!prefWeights[pref.item]) {
        prefWeights[pref.item] = 0;
      }
      prefWeights[pref.item] += pref.weight;
    });
    
    // Get top preferences for this range (most popular items in this order range)
    const topPrefs = Object.entries(prefWeights)
      .sort((a, b) => b[1] - a[1]) // Sort by weight (most popular first)
      .slice(0, 100) // Take top 100 preferences
      .map(([item, weight]) => item);
    
    patterns[range.name] = topPrefs;
  });
  
  return patterns;
}

// Get preference pattern for a specific order based on analyzed patterns
// This creates realistic fake user preferences that match the behavior of real users in similar order ranges
function getPreferencePatternForOrder(order, patterns) {
  let rangeName;
  
  // Determine which order range this fake user belongs to
  if (order <= 50) {
    rangeName = 'top50';
  } else if (order <= 100) {
    rangeName = 'orders51_100';
  } else if (order <= 200) {
    rangeName = 'orders101_200';
  } else if (order <= 300) {
    rangeName = 'orders201_300';
  } else {
    rangeName = 'orders301_plus';
  }
  
  const basePattern = patterns[rangeName] || [];
  
  // Generate a realistic preference list with high variance (like real users)
  const preferenceList = [];
  const usedItems = new Set();
  
  // Create a shuffled copy of the base pattern for randomness
  const shuffledPattern = [...basePattern].sort(() => Math.random() - 0.5);
  
  // Add 70-85% of items from the base pattern (higher overlap for realism)
  // This ensures fake users have similar but not identical preferences to real users
  const basePercentage = 0.7 + Math.random() * 0.15; // 70-85%
  const baseItems = shuffledPattern.slice(0, Math.floor(basePattern.length * basePercentage));
  
  // Add base items with some randomness in order (realistic preference ordering)
  const shuffledBaseItems = [...baseItems].sort(() => Math.random() - 0.5);
  shuffledBaseItems.forEach(item => {
    if (!usedItems.has(item)) {
      preferenceList.push(item);
      usedItems.add(item);
    }
  });
  
  // Add variation items with controlled randomness (realistic preference variations)
  const variationItems = [];
  baseItems.forEach(item => {
    const itemNum = parseInt(item);
    // Add items within ±2 to ±4 range (smaller, more realistic range)
    // This simulates users having preferences for similar items
    const range = 2 + Math.floor(Math.random() * 3); // 2-4 range
    for (let i = Math.max(1, itemNum - range); i <= itemNum + range; i++) {
      const variationItem = String(i);
      if (!usedItems.has(variationItem) && Math.random() < 0.25) { // 25% chance (reduced for realism)
        variationItems.push(variationItem);
        usedItems.add(variationItem);
      }
    }
  });
  
  // Shuffle variation items and add them to the preference list
  const shuffledVariationItems = variationItems.sort(() => Math.random() - 0.5);
  preferenceList.push(...shuffledVariationItems);
  
  // Add random items to fill up to the required order number (realistic preference list length)
  const randomItems = [];
  const targetCount = Math.max(order, 15); // Ensure we have at least 15 items, or the full order
  
  // Keep adding random items until we have enough (simulates users having many preferences)
  while (preferenceList.length < targetCount) {
    const randomItem = String(Math.floor(Math.random() * 700) + 1);
    if (!usedItems.has(randomItem)) {
      randomItems.push(randomItem);
      usedItems.add(randomItem);
      preferenceList.push(randomItem);
    }
    
    // Safety check to prevent infinite loop (prevent too many random items)
    if (usedItems.size > 600) {
      break;
    }
  }
  
  // If we still don't have enough, add sequential items (fallback to ensure minimum preferences)
  let nextItemNum = 1;
  while (preferenceList.length < targetCount && nextItemNum <= 700) {
    const nextItem = String(nextItemNum);
    if (!usedItems.has(nextItem)) {
      preferenceList.push(nextItem);
      usedItems.add(nextItem);
    }
    nextItemNum++;
  }
  
  // Final shuffle to randomize the order (realistic preference ordering)
  const finalList = preferenceList.sort(() => Math.random() - 0.5);
  
  // Limit to user's order number (more realistic - higher order users get more items)
  return finalList.slice(0, order);
}

// Get the most desired items (items with most first preferences)
function getMostDesiredItems(submissions, maxItems = 10) {
  const firstPreferenceCounts = {};
  
  submissions.forEach(user => {
    const rankedItems = user.rankedItems || [];
    if (rankedItems.length > 0) {
      const firstPref = String(rankedItems[0]);
      firstPreferenceCounts[firstPref] = (firstPreferenceCounts[firstPref] || 0) + 1;
    }
  });
  
  // Sort by first preference count and return top items
  return Object.entries(firstPreferenceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([item, count]) => item);
}

// Get items from most popular centros (using actual centro data)
async function getItemsFromPopularCentrosSync(submissions, maxCentros = 3) {
  // We need to get the items data to access centro information
  // For now, return empty array - this will be implemented properly
  // when we have access to the items data in the allocation context
  return [];
}

// Get items from most popular centros (proper implementation with items data)
function getItemsFromPopularCentrosWithItems(submissions, items, maxCentros = 3) {
  // Group items by centro de destino
  const itemsByCentro = {};
  items.forEach(item => {
    const centro = item['Centro de destino'] || 'Sin centro';
    const itemId = item['Vacante'];
    if (itemId && typeof itemId === 'number') {
      if (!itemsByCentro[centro]) {
        itemsByCentro[centro] = [];
      }
      itemsByCentro[centro].push(String(itemId));
    }
  });
  
  // Analyze first preferences by centro
  const centroFirstPreferences = {};
  submissions.forEach(user => {
    const rankedItems = user.rankedItems || [];
    if (rankedItems.length > 0) {
      const firstPref = String(rankedItems[0]);
      const item = items.find(i => i['Vacante'] == firstPref);
      if (item && item['Centro de destino']) {
        const centro = item['Centro de destino'];
        centroFirstPreferences[centro] = (centroFirstPreferences[centro] || 0) + 1;
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

// Get blocked item IDs based on selected localidades and centros
function getBlockedItemIds(items, blockedItems) {
  const { selectedLocalidades = [], selectedCentros = [] } = blockedItems;
  
  if (selectedLocalidades.length === 0 && selectedCentros.length === 0) {
    return [];
  }
  
  return items
    .filter(item => {
      const localidadMatch = selectedLocalidades.length === 0 || selectedLocalidades.includes(item.Localidad);
      const centroMatch = selectedCentros.length === 0 || selectedCentros.includes(item['Centro de destino']);
      return localidadMatch && centroMatch;
    })
    .map(item => String(item.Vacante));
}

// Convert scenario to simulation parameters
// This function defines the behavior for each allocation scenario (0-3)
function getScenarioParams(scenario, submissionsAbove, targetUserOrder, userCompetitionDepth = 1) {
  switch (scenario) {
    case 0: // Estado actual - show current allocation state
      return { 
        competitionDepth: 0, 
        description: "Estado actual de la asignación",
        includeFakeUsers: false // Only use real submissions
      };
    
    case 1: // Usuarios restantes se presentan - simulate missing users
      // Simulate actual missing users submitting their preferences
      return { 
        competitionDepth: 0, 
        description: "Si usuarios restantes contestasen",
        includeFakeUsers: true // Generate fake users for missing orders
      };
    
    case 2: // Destinos específicos se ocupan - simulate blocked destinations
      // Simulate if specific locations/centros were blocked
      return { 
        competitionDepth: 0, 
        description: "Si destinos específicos se ocupan",
        includeFakeUsers: false, // Only use real submissions
        markSpecificItemsUnavailable: true
      };
    
    case 3: // Bloqueo de preferencias - simulate competition depth
      // Simulate worst case where users above get their top N preferences (user-configurable)
      return { 
        competitionDepth: userCompetitionDepth, 
        description: `(${userCompetitionDepth} opciones bloqueadas)`,
        includeFakeUsers: false // Only use real submissions
      };
    
    default: // Fallback to scenario 0
      return { 
        competitionDepth: 0, 
        description: "Estado actual de la asignación",
        includeFakeUsers: false
      };
  }
}

// Round-robin allocation with exactly 1 item per user.
// Returns per-user: assignedItemIds and availableByPreference (backup allocations).
// scenario: simulation scenario (0-3) that determines competition depth
function allocate(submissions, scenario = 0, items = [], userCompetitionDepth = 1) {
  const { competitionDepth, includeFakeUsers } = getScenarioParams(scenario, submissions, 999, userCompetitionDepth);
  const x = competitionDepth;
  
  // If scenario 1 (missing users), generate fake submissions
  let allSubmissions = submissions;
  if (includeFakeUsers) {
    // For the full allocation, we need to find the max order to generate all missing users
    const maxOrder = Math.max(...submissions.map(s => s.order));
    allSubmissions = generateFakeSubmissions(submissions, maxOrder);
  }
  const users = [...allSubmissions].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (a.submittedAt || 0) - (b.submittedAt || 0);
  });

  const takenFinal = new Set();
  const assigned = new Map(users.map((u) => [u.id, []]));

  // Allocate exactly 1 item per user in priority order
  for (const u of users) {
    const next = (u.rankedItems || []).find(
      (id) => !takenFinal.has(String(id)),
    );
    if (typeof next !== "undefined") {
      const id = String(next);
      takenFinal.add(id);
      assigned.get(u.id).push(id);
    }
  }

  // Available-by-preference: show what user would get if first X preferences of users above were already taken
  const availableByPref = new Map();

  for (const u of users) {
    const userRankedItems = u.rankedItems || [];
    if (userRankedItems.length === 0) {
      availableByPref.set(u.id, []);
      continue;
    }

    // Collect all items that should be considered unavailable for this user:
    // 1. Items actually assigned to users above this user
    // 2. First X preferences of users above this user (for simulation purposes)
    const takenByUsersAbove = new Set();
    for (const otherUser of users) {
      if (otherUser.order < u.order) {
        // Add items actually assigned to users above
        const assignedItems = assigned.get(otherUser.id) || [];
        assignedItems.forEach(item => takenByUsersAbove.add(String(item)));
        
        // Also add first X preferences for simulation (if X > 0)
        const otherUserItems = otherUser.rankedItems || [];
        for (let i = 0; i < Math.min(x, otherUserItems.length); i++) {
          takenByUsersAbove.add(String(otherUserItems[i]));
        }
      }
    }

    // Find the next available items from this user's preference list
    // Keep going until we find 40 available items or run out of preferences
    const backupItems = [];
    const maxBackupItems = 40;
    
    // Get the user's actual assigned item to exclude it
    const actualAssigned = assigned.get(u.id);
    const actualItem = actualAssigned && actualAssigned.length > 0 ? String(actualAssigned[0]) : null;
    
    // Go through all user preferences and find available ones
    for (let i = 0; i < userRankedItems.length && backupItems.length < maxBackupItems; i++) {
      const item = String(userRankedItems[i]);
      
      // Skip if this is their actual assigned item
      if (item === actualItem) {
        continue;
      }
      
      // Skip if already in backup items (avoid duplicates)
      if (backupItems.includes(item)) {
        continue;
      }
      
      // Check if this item is available (not taken by users above)
      if (!takenByUsersAbove.has(item)) {
        backupItems.push(item);
      }
    }

    availableByPref.set(u.id, backupItems);
  }

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    order: u.order,
    rankedItems: u.rankedItems || [],
    assignedItemIds: assigned.get(u.id) || [],
    availableByPreference: availableByPref.get(u.id) || [],
  }));
}

// Optimized allocation for a single user given submissions from users above them
function allocateForUser(submissionsAbove, currentUser, scenario = 0, items = [], blockedItems = {}, userCompetitionDepth = 1) {
  const { competitionDepth, includeFakeUsers, markSpecificItemsUnavailable } = getScenarioParams(scenario, submissionsAbove, currentUser.order, userCompetitionDepth);
  const x = competitionDepth;
  
  // If scenario 1 (missing users), generate fake submissions for users above
  let allSubmissionsAbove = submissionsAbove;
  if (includeFakeUsers) {
    allSubmissionsAbove = generateFakeSubmissions(submissionsAbove, currentUser.order);
  }
  // Sort submissions above current user by priority (order, then submittedAt)
  const usersAbove = [...allSubmissionsAbove].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (a.submittedAt || 0) - (b.submittedAt || 0);
  });

  const takenByUsersAbove = new Set();
  const assignedAbove = new Map();

  // First pass: simulate allocation for users above
  for (const u of usersAbove) {
    const next = (u.rankedItems || []).find(
      (id) => !takenByUsersAbove.has(String(id)),
    );
    if (typeof next !== "undefined") {
      const id = String(next);
      takenByUsersAbove.add(id);
      assignedAbove.set(u.id, [id]);
    } else {
      assignedAbove.set(u.id, []);
    }
  }

  // If scenario 2 (specific items unavailable), mark specific items as unavailable
  if (markSpecificItemsUnavailable) {
    const blockedItemIds = getBlockedItemIds(items, blockedItems);
    blockedItemIds.forEach(itemId => {
      takenByUsersAbove.add(itemId);
    });
  }

  // Second pass: calculate current user's allocation
  const currentUserRankedItems = currentUser.rankedItems || [];
  const userAssignedItems = [];
  
  // Find first available item for current user
  const firstAvailable = currentUserRankedItems.find(
    (id) => !takenByUsersAbove.has(String(id)),
  );
  if (typeof firstAvailable !== "undefined") {
    userAssignedItems.push(String(firstAvailable));
    takenByUsersAbove.add(String(firstAvailable));
  }

  // Third pass: calculate available by preference for current user
  const availableByPref = [];
  const maxBackupItems = 50;
  const actualAssigned = userAssignedItems.length > 0 ? userAssignedItems[0] : null;

  // Add first X preferences of users above for simulation (if X > 0)
  const simulatedTaken = new Set(takenByUsersAbove);
  if (x > 0) {
    for (const u of usersAbove) {
      const otherUserItems = u.rankedItems || [];
      for (let i = 0; i < Math.min(x, otherUserItems.length); i++) {
        simulatedTaken.add(String(otherUserItems[i]));
      }
    }
  }

  // If scenario 2 (specific items unavailable), also mark them in simulated taken
  if (markSpecificItemsUnavailable) {
    const blockedItemIds = getBlockedItemIds(items, blockedItems);
    blockedItemIds.forEach(itemId => {
      simulatedTaken.add(itemId);
    });
  }

  // Find backup items for current user
  for (let i = 0; i < currentUserRankedItems.length && availableByPref.length < maxBackupItems; i++) {
    const item = String(currentUserRankedItems[i]);
    
    // Skip if this is their actual assigned item
    if (item === actualAssigned) {
      continue;
    }
    
    // Skip if already in backup items (avoid duplicates)
    if (availableByPref.includes(item)) {
      continue;
    }
    
    // Check if this item is available (not taken by users above or simulation)
    if (!simulatedTaken.has(item)) {
      availableByPref.push(item);
    }
  }

  return {
    userId: currentUser.id,
    name: currentUser.name,
    order: currentUser.order,
    rankedItems: currentUser.rankedItems || [],
    assignedItemIds: userAssignedItems,
    availableByPreference: availableByPref,
  };
}

module.exports = { allocate, allocateForUser, generateFakeSubmissions, getMostDesiredItems, getItemsFromPopularCentrosSync, getItemsFromPopularCentrosWithItems, getBlockedItemIds };
