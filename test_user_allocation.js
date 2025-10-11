// Test allocation for a specific user against real DynamoDB data
require("dotenv").config();
const { allocate } = require('./src/lib/allocate');
const { createDdb } = require('./src/lib/ddb');

async function testUserAllocationFromDB(targetUserId, season = null, x = 0) {
  console.log("=== Real DynamoDB User Allocation Test ===\n");
  
  // Set up DynamoDB connection
  const ddb = createDdb({
    region: process.env.AWS_REGION,
    tableName: process.env.DDB_TABLE,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  if (!ddb.enabled) {
    console.error("❌ DynamoDB not enabled. Check your environment variables:");
    console.error("   AWS_REGION, DDB_TABLE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
    return;
  }

  // Use current year if no season specified
  if (!season) {
    season = new Date().getFullYear().toString();
  }

  console.log(`📅 Season: ${season}`);
  console.log(`🎯 Target User ID: ${targetUserId}\n`);

  try {
    // Fetch all submissions for the season
    console.log("📥 Fetching all submissions from DynamoDB...");
    const allSubmissions = await ddb.fetchAllSubmissions(season);
    
    if (allSubmissions.length === 0) {
      console.log("❌ No submissions found for this season.");
      return;
    }

    console.log(`📊 Found ${allSubmissions.length} total submissions\n`);

    // Find the target user
    const targetUser = allSubmissions.find(sub => sub.id === targetUserId);
    if (!targetUser) {
      console.log("❌ Target user not found in submissions.");
      console.log("Available user IDs:");
      allSubmissions.forEach(sub => {
        console.log(`   - ${sub.id} (${sub.name})`);
      });
      return;
    }

    console.log("👤 TARGET USER FOUND:");
    console.log(`   Name: ${targetUser.name}`);
    console.log(`   Order: ${targetUser.order}`);
    console.log(`   Ranked Items: [${targetUser.rankedItems.join(', ')}]`);
    console.log(`   Submitted At: ${new Date(targetUser.submittedAt).toLocaleString()}\n`);

    // Run allocation with all real data
    console.log("🔄 Running allocation algorithm...\n");
    if (x > 0) {
      console.log(`📊 Using X=${x} (first ${x} preferences of users above marked unavailable)\n`);
    }
    const result = allocate(allSubmissions, x);

    // Find the target user's result
    const targetResult = result.find(r => r.userId === targetUserId);
    
    console.log("📋 ALLOCATION RESULTS:");
    console.log("=".repeat(50));
    
    // Show all users sorted by order
    const sortedResults = result.sort((a, b) => a.order - b.order);
    sortedResults.forEach((user, index) => {
      const isTarget = user.userId === targetUserId;
      const marker = isTarget ? "🎯" : "👥";
      const assigned = user.assignedItemIds.length > 0 ? user.assignedItemIds.join(', ') : 'none';
      const available = user.availableByPreference.length > 0 ? user.availableByPreference.join(', ') : 'none';
      
      console.log(`${marker} ${user.name} (order: ${user.order}):`);
      console.log(`   ✅ Assigned: [${assigned}]`);
      console.log(`   📋 Available by preference: [${available}]`);
      if (isTarget) {
        console.log(`   🎯 TARGET USER - Success rate: ${user.assignedItemIds.length}/${user.rankedItems.length} items`);
      }
      console.log();
    });

    // Detailed analysis for target user
    console.log("🎯 TARGET USER DETAILED ANALYSIS:");
    console.log("=".repeat(40));
    console.log(`Name: ${targetResult.name}`);
    console.log(`Order: ${targetResult.order} (${getOrderDescription(targetResult.order, sortedResults.length)})`);
    console.log(`Wanted: [${targetResult.rankedItems.join(', ')}]`);
    console.log(`Got: [${targetResult.assignedItemIds.join(', ') || 'nothing'}]`);
    console.log(`Success rate: ${targetResult.assignedItemIds.length}/${targetResult.rankedItems.length} items`);
    
    // Show what items were taken by higher priority users
    const higherPriorityUsers = sortedResults.filter(r => r.order < targetResult.order);
    const takenByHigher = new Set();
    higherPriorityUsers.forEach(user => {
      user.assignedItemIds.forEach(item => takenByHigher.add(item));
    });
    
    const wantedButTaken = targetResult.rankedItems.filter(item => takenByHigher.has(item));
    if (wantedButTaken.length > 0) {
      console.log(`Items wanted but taken by higher priority: [${wantedButTaken.join(', ')}]`);
    }

    return result;

  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

function getOrderDescription(order, totalUsers) {
  const percentile = Math.round((order / totalUsers) * 100);
  if (percentile <= 25) return `top ${percentile}% priority`;
  if (percentile <= 50) return `above average priority`;
  if (percentile <= 75) return `below average priority`;
  return `low priority`;
}

// Example usage - modify the user ID and season as needed
async function runExample() {
  try {
    // Replace with actual user ID from your database
    const targetUserId = "u_et05qsbbu2t"; // Example from README
    const season = "2025"; // or null for current year
    
    await testUserAllocationFromDB(targetUserId, season);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run if called directly
if (require.main === module) {
  runExample();
}

// Helper function to list all users in a season
async function listAllUsers(season = null) {
  console.log("=== List All Users in DynamoDB ===\n");
  
  const ddb = createDdb({
    region: process.env.AWS_REGION,
    tableName: process.env.DDB_TABLE,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  if (!ddb.enabled) {
    console.error("❌ DynamoDB not enabled. Check your environment variables.");
    return;
  }

  if (!season) {
    season = new Date().getFullYear().toString();
  }

  console.log(`📅 Season: ${season}\n`);

  try {
    const allSubmissions = await ddb.fetchAllSubmissions(season);
    
    if (allSubmissions.length === 0) {
      console.log("❌ No submissions found for this season.");
      return;
    }

    console.log(`📊 Found ${allSubmissions.length} users:\n`);
    
    const sortedUsers = allSubmissions.sort((a, b) => a.order - b.order);
    sortedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Order: ${user.order}`);
      console.log(`   Items: [${user.rankedItems.join(', ')}]`);
      console.log(`   Submitted: ${new Date(user.submittedAt).toLocaleString()}`);
      console.log();
    });

    return allSubmissions;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

// Export the functions
module.exports = { testUserAllocationFromDB, listAllUsers };
