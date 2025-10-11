// src/lib/allocate.js

// Round-robin allocation with exactly 1 item per user.
// Returns per-user: assignedItemIds and availableByPreference (next 20 backup allocations).
function allocate(submissions) {
  const users = [...submissions].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (a.submittedAt || 0) - (b.submittedAt || 0);
  });

  const takenFinal = new Set();
  const assigned = new Map(users.map((u) => [u.id, []]));

  // Allocate exactly 1 item per user in priority order
  for (const u of users) {
    const next = (u.rankedItems || []).find(
      (id) => !takenFinal.has(String(id))
    );
    if (typeof next !== "undefined") {
      const id = String(next);
      takenFinal.add(id);
      assigned.get(u.id).push(id);
    }
  }

  // Available-by-preference: show next 20 items user would get in different scenarios
  const availableByPref = new Map();
  
  for (const u of users) {
    const userRankedItems = u.rankedItems || [];
    if (userRankedItems.length === 0) {
      availableByPref.set(u.id, []);
      continue;
    }
    
    const backupItems = [];
    const maxBackupItems = 20;
    
    // Simulate different scenarios by progressively marking more items as unavailable
    for (let scenario = 1; scenario <= maxBackupItems && scenario < userRankedItems.length; scenario++) {
      const simulatedTaken = new Set();
      const simulatedAssigned = new Map();
      
      // Mark the first 'scenario' items from this user's preferences as unavailable
      for (let i = 0; i < scenario; i++) {
        simulatedTaken.add(String(userRankedItems[i]));
      }
      
      // Run the allocation simulation
      for (const otherUser of users) {
        const userPick = (otherUser.rankedItems || []).find(
          (id) => !simulatedTaken.has(String(id))
        );
        
        if (userPick) {
          simulatedTaken.add(String(userPick));
          simulatedAssigned.set(otherUser.id, String(userPick));
        }
      }
      
      // Get what this user would get in this scenario
      const backupPick = simulatedAssigned.get(u.id);
      if (backupPick) {
        backupItems.push(backupPick);
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

module.exports = { allocate };
