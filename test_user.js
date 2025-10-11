#!/usr/bin/env node

// Simple script to test user allocation from DynamoDB
const { testUserAllocationFromDB, listAllUsers } = require('./test_user_allocation');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("Usage:");
    console.log("  node test_user.js list [season]           - List all users");
    console.log("  node test_user.js test <userId> [season]  - Test specific user");
    console.log("");
    console.log("Examples:");
    console.log("  node test_user.js list");
    console.log("  node test_user.js list 2024");
    console.log("  node test_user.js test u_73t4dx4ron8");
    console.log("  node test_user.js test u_73t4dx4ron8 2024");
    return;
  }

  const command = args[0];
  
  if (command === 'list') {
    const season = args[1] || null;
    await listAllUsers(season);
  } else if (command === 'test') {
    const userId = args[1];
    const season = args[2] || null;
    
    if (!userId) {
      console.error("❌ Please provide a user ID");
      console.log("Usage: node test_user.js test <userId> [season]");
      return;
    }
    
    await testUserAllocationFromDB(userId, season);
  } else {
    console.error(`❌ Unknown command: ${command}`);
    console.log("Use 'list' or 'test'");
  }
}

main().catch(console.error);
