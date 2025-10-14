// src/lib/fakeUsers.js
// Fake user generation and preference pattern analysis for simulation scenarios

/**
 * Generate realistic fake submissions for missing users in scenario 1
 * This creates synthetic users to fill gaps in the submission order for realistic simulation
 */
function generateFakeSubmissions(realSubmissions, targetUserOrder) {
  const realOrders = realSubmissions.map((s) => s.order).sort((a, b) => a - b);
  const minOrder = Math.min(...realOrders);
  const maxOrder = Math.max(...realOrders);

  // Calculate exactly how many fake users we need
  const totalUsersNeeded = targetUserOrder - 1; // User order 422 needs 421 users above
  const fakeUsersNeeded = totalUsersNeeded - realSubmissions.length;

  if (fakeUsersNeeded <= 0) {
    return realSubmissions;
  }

  // Create a Set for O(1) lookup of existing orders
  const existingOrders = new Set(realOrders);
  const missingOrders = [];

  // Find gaps in the sequence and generate fake users for them
  for (let i = 1; i < targetUserOrder; i++) {
    if (!existingOrders.has(i)) {
      missingOrders.push(i);
    }
  }

  // Keep this useful log showing the missing orders
  console.log(
    `[FAKE-DEBUG] Real submissions above user: ${realSubmissions.length}`,
  );
  console.log(`[FAKE-DEBUG] Missing orders: ${missingOrders.join(", ")}`);

  if (missingOrders.length === 0) {
    return realSubmissions; // No gaps to fill
  }

  // Analyze preference patterns by order ranges to generate realistic fake preferences
  // This ensures fake users have believable preference patterns based on real data
  const preferencePatterns = analyzePreferencePatterns(realSubmissions);

  // Generate fake submissions for missing orders
  const fakeSubmissions = missingOrders.map((missingOrder) => {
    const pattern = getPreferencePatternForOrder(
      missingOrder,
      preferencePatterns,
    );
    return {
      id: `fake_${missingOrder}`,
      userId: `fake_user_${missingOrder}`,
      name: `Usuario ${missingOrder}`,
      order: missingOrder,
      rankedItems: pattern,
      submittedAt: Date.now() - missingOrder * 1000, // Stagger submission times for realism
      isFake: true, // Mark as fake for filtering in position calculations
    };
  });

  // Combine real and fake submissions, sort by order
  const allSubmissions = [...realSubmissions, ...fakeSubmissions].sort(
    (a, b) => a.order - b.order,
  );

  return allSubmissions;
}

/**
 * Analyze preference patterns by order ranges to generate realistic fake user preferences
 * This helps create believable fake users that match the behavior patterns of real users
 */
function analyzePreferencePatterns(submissions) {
  const patterns = {};

  // Define order ranges to capture different user behavior patterns
  const ranges = [
    { name: "top50", min: 1, max: 50 }, // Early submitters (high priority)
    { name: "orders51_100", min: 51, max: 100 }, // Mid-range submitters
    { name: "orders101_200", min: 101, max: 200 }, // Mid-late submitters
    { name: "orders201_300", min: 201, max: 300 }, // Late submitters
    { name: "orders301_plus", min: 301, max: 999 }, // Very late submitters
  ];

  ranges.forEach((range) => {
    const usersInRange = submissions.filter(
      (s) => s.order >= range.min && s.order <= range.max,
    );
    if (usersInRange.length === 0) return;

    // Collect all preferences from users in this range
    const allPreferences = [];
    usersInRange.forEach((user) => {
      if (user.rankedItems && Array.isArray(user.rankedItems)) {
        allPreferences.push(...user.rankedItems);
      }
    });

    // Count preference frequency
    const preferenceCounts = {};
    allPreferences.forEach((pref) => {
      preferenceCounts[pref] = (preferenceCounts[pref] || 0) + 1;
    });

    // Sort by frequency and take top preferences
    const topPreferences = Object.entries(preferenceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pref]) => pref);

    patterns[range.name] = {
      topPreferences,
      totalUsers: usersInRange.length,
      avgPreferencesPerUser: allPreferences.length / usersInRange.length,
    };
  });

  return patterns;
}

/**
 * Get preference pattern for a specific order based on analyzed patterns
 * This creates realistic fake user preferences that match the behavior of similar real users
 */
function getPreferencePatternForOrder(order, patterns) {
  // Determine which range this order falls into
  let rangeName = "orders301_plus"; // default
  if (order <= 50) rangeName = "top50";
  else if (order <= 100) rangeName = "orders51_100";
  else if (order <= 200) rangeName = "orders101_200";
  else if (order <= 300) rangeName = "orders201_300";

  const pattern = patterns[rangeName];
  if (!pattern || !pattern.topPreferences) {
    // Fallback: return empty array if no pattern available
    return [];
  }

  // Generate a realistic preference list
  const basePreferences = [...pattern.topPreferences];
  const variationCount = Math.min(5, Math.floor(Math.random() * 8) + 3); // 3-10 preferences
  const selectedPreferences = [];

  // Add some base preferences (most popular ones)
  const baseCount = Math.min(3, variationCount);
  for (let i = 0; i < baseCount && i < basePreferences.length; i++) {
    selectedPreferences.push(basePreferences[i]);
  }

  // Add some variation (less popular preferences)
  const remainingPreferences = basePreferences.slice(baseCount);
  const variationNeeded = variationCount - selectedPreferences.length;
  for (let i = 0; i < variationNeeded && i < remainingPreferences.length; i++) {
    const randomIndex = Math.floor(Math.random() * remainingPreferences.length);
    const selected = remainingPreferences.splice(randomIndex, 1)[0];
    selectedPreferences.push(selected);
  }

  // Shuffle the preferences to make them more realistic
  return selectedPreferences.sort(() => Math.random() - 0.5);
}

module.exports = {
  generateFakeSubmissions,
  analyzePreferencePatterns,
  getPreferencePatternForOrder,
};
