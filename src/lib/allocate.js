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

    // Collect all first X preferences from users above this user
    const takenByUsersAbove = new Set();
    for (const otherUser of users) {
      if (otherUser.order < u.order) {
        const otherUserItems = otherUser.rankedItems || [];
        // Mark the first X preferences of this user above as taken
        for (let i = 0; i < Math.min(x, otherUserItems.length); i++) {
          takenByUsersAbove.add(String(otherUserItems[i]));
        }
      }
    }

    // Find what this user would get if their first few preferences were also unavailable
    const backupItems = [];
    const maxBackupItems = 20;

    for (
      let skipCount = 1;
      skipCount <= maxBackupItems && skipCount < userRankedItems.length;
      skipCount++
    ) {
      // Find the first available item after skipping the first 'skipCount' preferences
      const availableItem = userRankedItems
        .slice(skipCount)
        .find((id) => !takenByUsersAbove.has(String(id)));

      if (availableItem) {
        const itemStr = String(availableItem);
        // Only add if it's different from their actual assigned item
        const actualAssigned = assigned.get(u.id);
        const actualItem =
          actualAssigned && actualAssigned.length > 0
            ? String(actualAssigned[0])
            : null;
        if (itemStr !== actualItem && !backupItems.includes(itemStr)) {
          backupItems.push(itemStr);
        }
      }
    }

    availableByPref.set(u.id, backupItems.slice(0, maxBackupItems));
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

module.exports = { allocate };
