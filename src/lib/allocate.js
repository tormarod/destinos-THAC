// src/lib/allocate.js

// Round-robin allocation up to each user's quota (quota = their `order`).
// Returns per-user: assignedItemIds and availableByPreference.
function allocate(submissions) {
  const users = [...submissions].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (a.submittedAt || 0) - (b.submittedAt || 0);
  });

  // quota = numeric order (min 0)
  const remainingQuota = new Map(
    users.map((u) => [u.id, Math.max(0, Number(u.order) || 0)])
  );

  const takenFinal = new Set();
  const assigned = new Map(users.map((u) => [u.id, []]));

  // Round-robin until no progress
  let progress = true;
  while (progress) {
    progress = false;
    for (const u of users) {
      if (remainingQuota.get(u.id) <= 0) continue;
      const next = (u.rankedItems || []).find(
        (id) => !takenFinal.has(String(id))
      );
      if (typeof next !== "undefined") {
        const id = String(next);
        takenFinal.add(id);
        assigned.get(u.id).push(id);
        remainingQuota.set(u.id, remainingQuota.get(u.id) - 1);
        progress = true;
      }
    }
  }

  // Available-by-preference: hide items taken by higher-priority users
  const availableByPref = new Map();
  const takenByHigher = new Set();
  for (const u of users) {
    const list = (u.rankedItems || [])
      .map(String)
      .filter((id) => !takenByHigher.has(id));
    availableByPref.set(u.id, list);
    // update higher set by the items the current user actually got
    for (const id of assigned.get(u.id)) takenByHigher.add(id);
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
