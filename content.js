/**
 * AlwaysGoHome Extension - Content Script
 * Version: 2.0
 * Last updated: 2025-03-12
 */

// Function to log only critical errors
function logError(message) {
  console.error("[AlwaysGoHome Content]", message);
}

// Function to log debug info
function logDebug(message) {
  console.log("[AlwaysGoHome Content]", message);
}

// Flag to prevent multiple handlers from processing the same click
let processingClick = false;

// Check if this is our homepage tab by looking for the special hash
function isHomepageTab() {
  return window.location.href.includes('alwaysGoHomeSameTab');
}

// Mark this tab as the homepage tab
function registerAsHomepage() {
  chrome.runtime.sendMessage({ action: 'markAsHomepageTab' }, function(response) {
    if (chrome.runtime.lastError) {
      logError("Error marking tab: " + chrome.runtime.lastError.message);
    } else if (response && response.success) {
      logDebug("Successfully registered as homepage tab");
    }
  });
}

// Set up event handlers for link clicks
function setupLinkHandlers() {
  logDebug("Setting up link handlers on homepage");
  
  // The most reliable way to intercept clicks
  document.addEventListener('click', function(e) {
    // Skip if already processing a click
    if (processingClick) return;
    
    const link = e.target.closest('a');
    if (!link) return;
    
    // We want to intercept links that would normally open in a new tab
    const opensInNewTab = link.target === '_blank' || link.getAttribute('rel') === 'noopener';
    if (!opensInNewTab) return;
    
    logDebug("Intercepting link click: " + link.href);
    
    // Set flag to prevent double-processing
    processingClick = true;
    
    // Always prevent the default browser behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Open in a new window instead
    try {
      const windowName = 'newWindow' + Date.now();
      const windowFeatures = 'width=1000,height=800,menubar=yes,location=yes,resizable=yes,scrollbars=yes,status=yes';
      
      const newWindow = window.open(link.href, windowName, windowFeatures);
      
      if (!newWindow) {
        logError("Failed to open new window - popup blocked?");
        // If popup blocked, navigate in same tab as fallback
        window.location.href = link.href;
      } else {
        logDebug("Successfully opened new window");
        
        // Focus the newly opened window
        newWindow.focus();
      }
    } catch (err) {
      logError("Error opening window: " + err);
      // Fallback
      window.location.href = link.href;
    }
    
    // Reset the flag after a short delay
    setTimeout(() => {
      processingClick = false;
    }, 100);
    
    return false;
  }, true);
}

// Initialize when the page loads
function init() {
  logDebug("Content script running on: " + window.location.href);
  
  // If this is our homepage tab
  if (isHomepageTab()) {
    logDebug("This is our homepage tab");
    
    // Mark this as our homepage tab
    registerAsHomepage();
    
    // Set up handlers for links
    setupLinkHandlers();
  }
}

// Run immediately or wait for DOM content to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Also check when fully loaded (for late-loading content)
window.addEventListener('load', function() {
  if (isHomepageTab() && !processingClick) {
    // Double-check our link handlers are set up
    setupLinkHandlers();
  }
}); 