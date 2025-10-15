// public/app.js
// Main application initialization and coordination

// Helper function for DOM selection
const $ = (id) => document.getElementById(id);

// Initialize application when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Check version and force refresh if needed
  window.stateModule.checkVersionAndRefresh();

  // Small delay to ensure all modules are loaded
  await new Promise(resolve => setTimeout(resolve, 50));

  // Initialize changelog system (shows modal if new version detected)
  window.changelogModule.initializeChangelog();

  // Initialize season selection
  await window.scenariosModule.populateSeasonSelect();

  // Initialize submit button state and start cooldown timer
  window.submissionModule.updateSubmitButtonState();

  // Only start timer if we're actually on cooldown
  if (window.submissionModule.isSubmissionTooRecent()) {
    window.submissionModule.startCooldownTimer();
  }

  // Set up all event listeners
  window.eventsModule.setupEventListeners();

  // Initialize scenario UI (shows/hides panels based on initial selection)
  window.scenariosModule.initializeScenarioUI();

  // Load location options for scenario 2
  window.scenariosModule.loadLocationOptions();

  // Note: UI rendering is now triggered automatically when data is loaded in setSeason()
});

// Make helper function globally available
window.$ = $;