// public/changelog.js
// Changelog modal system for showing version updates

const CHANGELOG_SEEN_KEY = "allocator:changelogSeen";

/**
 * Fetch changelog content from the API
 */
async function fetchChangelog() {
  try {
    const response = await fetch("/api/changelog");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const markdown = await response.text();
    return markdown;
  } catch (error) {
    console.error("Error fetching changelog:", error);
    return null;
  }
}

/**
 * Parse markdown changelog and extract latest version
 */
function parseChangelog(markdown) {
  if (!markdown) return null;

  const lines = markdown.split('\n');
  const versions = [];
  let currentVersion = null;
  let currentContent = [];
  let koFiSection = '';

  for (const line of lines) {
    // Match version headers: ## [1.5.2] - 2025-01-15
    const versionMatch = line.match(/^## \[([^\]]+)\]/);
    if (versionMatch) {
      // Save previous version if exists
      if (currentVersion) {
        versions.push({
          version: currentVersion,
          content: currentContent.join('\n').trim()
        });
      }
      
      // Start new version
      currentVersion = versionMatch[1];
      currentContent = [line];
    } else if (currentVersion) {
      currentContent.push(line);
    } else {
      // Content before first version (Ko-fi section)
      koFiSection += line + '\n';
    }
  }

  // Add the last version
  if (currentVersion) {
    versions.push({
      version: currentVersion,
      content: currentContent.join('\n').trim()
    });
  }

  // If we have versions, prepend the Ko-fi section to the latest version
  if (versions.length > 0 && koFiSection.trim()) {
    versions[0].content = koFiSection.trim() + '\n\n' + versions[0].content;
  }

  return versions;
}

/**
 * Convert markdown to HTML for display
 */
function markdownToHtml(markdown) {
  if (!markdown) return '';

  return markdown
    // Ko-fi section (special handling)
    .replace(/^💝 ¿Te gusta esta herramienta\? \[([^\]]+)\]\(([^)]+)\) ☕$/gm, '<div class="changelog-kofi">💝 ¿Te gusta esta herramienta? <a href="$2" target="_blank" rel="noopener noreferrer">$1</a> ☕</div>')
    
    // Headers
    .replace(/^### (Nuevas Funcionalidades?)$/gm, '<h3 class="changelog-features">$1</h3>')
    .replace(/^### (Correcciones?)$/gm, '<h3 class="changelog-fixes">$1</h3>')
    .replace(/^### (Mejoras?)$/gm, '<h3 class="changelog-improvements">$1</h3>')
    .replace(/^### (Features?)$/gm, '<h3 class="changelog-features">$1</h3>')
    .replace(/^### (Fixes?)$/gm, '<h3 class="changelog-fixes">$1</h3>')
    .replace(/^### (Improvements?)$/gm, '<h3 class="changelog-improvements">$1</h3>')
    .replace(/^## \[([^\]]+)\]/gm, '<h2 class="changelog-version">Versión $1</h2>')
    
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    
    // Links (general)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    
    // Lists
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="changelog-divider">')
    
    // Line breaks
    .replace(/\n/g, '<br>')
    
    // Clean up multiple line breaks
    .replace(/(<br>){3,}/g, '<br><br>');
}

/**
 * Check if changelog should be shown for current version
 */
function shouldShowChangelog() {
  const currentVersion = window.APP_VERSION || "1.0.0";
  const lastSeenVersion = localStorage.getItem(CHANGELOG_SEEN_KEY);
  
  return lastSeenVersion !== currentVersion;
}

/**
 * Mark changelog as seen for current version
 */
function markChangelogAsSeen() {
  const currentVersion = window.APP_VERSION || "1.0.0";
  localStorage.setItem(CHANGELOG_SEEN_KEY, currentVersion);
}

/**
 * Show changelog modal
 */
async function showChangelogModal() {
  const modal = document.getElementById("changelogModal");
  const content = document.getElementById("changelogContent");
  
  if (!modal || !content) {
    console.error("Changelog modal elements not found");
    return;
  }

  try {
    // Fetch and parse changelog
    const markdown = await fetchChangelog();
    if (!markdown) {
      console.error("Failed to fetch changelog");
      return;
    }

    const versions = parseChangelog(markdown);
    if (!versions || versions.length === 0) {
      console.error("No versions found in changelog");
      return;
    }

    // Show latest version
    const latestVersion = versions[0];
    const html = markdownToHtml(latestVersion.content);
    content.innerHTML = html;

    // Show modal
    modal.style.display = "flex";
    document.body.style.overflow = "hidden"; // Prevent background scrolling

  } catch (error) {
    console.error("Error showing changelog:", error);
  }
}

/**
 * Hide changelog modal
 */
function hideChangelogModal() {
  const modal = document.getElementById("changelogModal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = ""; // Restore scrolling
  }
}

/**
 * Toggle "What's New" button visibility
 */
function updateWhatsNewButtonVisibility() {
  const button = document.getElementById("whatsNewButton");
  if (!button) return;

  // Show button if user has seen at least one version
  const hasSeenChangelog = localStorage.getItem(CHANGELOG_SEEN_KEY) !== null;
  button.style.display = hasSeenChangelog ? "block" : "none";
}

/**
 * Initialize changelog system
 */
function initializeChangelog() {
  // Update "What's New" button visibility
  updateWhatsNewButtonVisibility();

  // Show changelog if new version detected
  if (shouldShowChangelog()) {
    // Small delay to ensure page is fully loaded
    setTimeout(() => {
      showChangelogModal();
    }, 500);
  }
}

// Export functions for use by other modules
window.changelogModule = {
  showChangelogModal,
  hideChangelogModal,
  markChangelogAsSeen,
  shouldShowChangelog,
  updateWhatsNewButtonVisibility,
  initializeChangelog,
};
