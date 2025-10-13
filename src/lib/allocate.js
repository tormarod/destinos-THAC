// src/lib/allocate.js

// Round-robin allocation with exactly 1 item per user.
// Returns per-user: assignedItemIds and availableByPreference (backup allocations).
// x: number of first preferences of users above to mark as unavailable (default: 0)
function allocate(submissions, x = 0) {
  const users = [...submissions].sort((a, b) => {
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
function allocateForUser(submissionsAbove, currentUser, x = 0) {
  // Sort submissions above current user by priority (order, then submittedAt)
  const usersAbove = [...submissionsAbove].sort((a, b) => {
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
  const maxBackupItems = 20;
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

module.exports = { allocate, allocateForUser };
