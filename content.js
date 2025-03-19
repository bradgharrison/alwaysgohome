/**
 * Version: 2.1.0
 * Content script for AlwaysGoHome extension
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

// Function to ensure the page has focus
function ensurePageFocus() {
  logDebug("Ensuring page has focus");
  
  try {
    // Don't try to focus if user is already typing somewhere
    if (document.activeElement && 
        (document.activeElement.tagName === 'INPUT' || 
         document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.isContentEditable)) {
      logDebug("User is already typing, not changing focus");
      return;
    }

    // First, focus the window
    window.focus();
    
    // Then focus the document body
    if (document.body) {
      document.body.setAttribute('tabindex', '0');
      document.body.style.outline = 'none'; // Hide focus ring
      document.body.focus({ preventScroll: true });
    }
    
    // Try to find and focus a search input if it exists
    const searchInputs = document.querySelectorAll('input[type="search"], input[name="q"], input[name="query"], input[name="search"]');
    if (searchInputs.length > 0) {
      searchInputs[0].focus({ preventScroll: true });
      logDebug("Focused search input");
      return;
    }
    
    // If no search input, ensure body has focus
    if (document.body) {
      document.body.focus({ preventScroll: true });
      logDebug("Focused document body");
    }
  } catch (e) {
    logError("Error ensuring focus: " + e);
  }
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
    
    // Try to focus once on load
    ensurePageFocus();
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
  if (isHomepageTab()) {
    // Double-check our link handlers are set up
    setupLinkHandlers();
    // Try focus one more time after full load
    ensurePageFocus();
  }
});

// Listen for visibility changes
document.addEventListener('visibilitychange', function() {
  if (!document.hidden && isHomepageTab()) {
    // When the page becomes visible, ensure it has focus
    ensurePageFocus();
  }
});

// Listen for window focus
window.addEventListener('focus', function() {
  if (isHomepageTab()) {
    // When the window gets focus, ensure the page has focus
    ensurePageFocus();
  }
}); 