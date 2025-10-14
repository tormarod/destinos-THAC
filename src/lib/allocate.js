// src/lib/allocate.js
// Core allocation algorithm for destination assignment

const { generateFakeSubmissions } = require("./fakeUsers");
const { getBlockedItemIds } = require("./itemUtils");

/**
 * Convert scenario to simulation parameters
 * This function defines the behavior for each allocation scenario (0-3)
 */
function getScenarioParams(
  scenario,
  submissionsAbove,
  targetUserOrder,
  userCompetitionDepth = 1,
) {
  switch (scenario) {
    case 0: // Estado actual - show current allocation state
      return {
        competitionDepth: 0,
        description: "Estado actual de la asignación",
        includeFakeUsers: false, // Only use real submissions
      };

    case 1: // Usuarios restantes se presentan - simulate missing users
      // Simulate actual missing users submitting their preferences
      return {
        competitionDepth: 0,
        description: "Si usuarios restantes contestasen",
        includeFakeUsers: true, // Generate fake users for missing orders
      };

    case 2: // Destinos específicos se ocupan - simulate blocked destinations
      // Simulate if specific locations/centros were blocked
      return {
        competitionDepth: 0,
        description: "Si destinos específicos se ocupan",
        includeFakeUsers: false, // Only use real submissions
        markSpecificItemsUnavailable: true,
      };

    case 3: // Bloqueo de preferencias - simulate competition depth
      // Simulate worst case where users above get their top N preferences (user-configurable)
      return {
        competitionDepth: userCompetitionDepth,
        description: `(${userCompetitionDepth} opciones bloqueadas)`,
        includeFakeUsers: false, // Only use real submissions
      };

    default: // Fallback to scenario 0
      return {
        competitionDepth: 0,
        description: "Estado actual de la asignación",
        includeFakeUsers: false,
      };
  }
}

/**
 * Round-robin allocation with exactly 1 item per user.
 * Returns per-user: assignedItemIds and availableByPreference (backup allocations).
 * scenario: simulation scenario (0-3) that determines competition depth
 */
function allocate(
  submissions,
  scenario = 0,
  items = [],
  userCompetitionDepth = 1,
) {
  const { competitionDepth, includeFakeUsers } = getScenarioParams(
    scenario,
    submissions,
    999,
    userCompetitionDepth,
  );
  const x = competitionDepth;

  // If scenario 1 (missing users), generate fake submissions
  let allSubmissions = submissions;
  if (includeFakeUsers) {
    // For the full allocation, we need to find the max order to generate all missing users
    const maxOrder = Math.max(...submissions.map((s) => s.order));
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
        assignedItems.forEach((item) => takenByUsersAbove.add(String(item)));

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
    const actualItem =
      actualAssigned && actualAssigned.length > 0
        ? String(actualAssigned[0])
        : null;

    // Go through all user preferences and find available ones
    for (
      let i = 0;
      i < userRankedItems.length && backupItems.length < maxBackupItems;
      i++
    ) {
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

/**
 * Optimized allocation for a single user given submissions from users above them
 */
function allocateForUser(
  submissionsAbove,
  currentUser,
  scenario = 0,
  items = [],
  blockedItems = {},
  userCompetitionDepth = 1,
) {
  const { competitionDepth, includeFakeUsers, markSpecificItemsUnavailable } =
    getScenarioParams(
      scenario,
      submissionsAbove,
      currentUser.order,
      userCompetitionDepth,
    );
  const x = competitionDepth;

  // If scenario 1 (missing users), generate fake submissions for users above
  let allSubmissionsAbove = submissionsAbove;
  if (includeFakeUsers) {
    allSubmissionsAbove = generateFakeSubmissions(
      submissionsAbove,
      currentUser.order,
    );
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
    blockedItemIds.forEach((itemId) => {
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
  const actualAssigned =
    userAssignedItems.length > 0 ? userAssignedItems[0] : null;

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
    blockedItemIds.forEach((itemId) => {
      simulatedTaken.add(itemId);
    });
  }

  // Find backup items for current user
  for (
    let i = 0;
    i < currentUserRankedItems.length &&
    availableByPref.length < maxBackupItems;
    i++
  ) {
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

module.exports = {
  allocate,
  allocateForUser,
  getScenarioParams,
};