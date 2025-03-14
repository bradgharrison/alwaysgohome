/**
 * AlwaysGoHome Extension - Content Script
 * Version: 2.1
 * Last updated: 2023-05-20
 */

// Debug mode flag - set to true to enable verbose logging
const DEBUG_MODE = false;

// Function to log errors
function logError(message) {
  console.error("[AlwaysGoHome Content]", message);
}

// Function to log debug info
function logDebug(message) {
  if (DEBUG_MODE) {
    console.log("[AlwaysGoHome Content]", message);
  }
}

// Helper function to check if a URL is valid and non-empty
function isValidHomepage(url) {
  return url && typeof url === 'string' && url.trim() !== '';
}

// Flag to prevent multiple handlers from processing the same click
let processingClick = false;

// Function to ensure the page has focus
function ensurePageFocus() {
  try {
    // Focus the window
    window.focus();
    
    // Focus the document
    document.body.focus();
    
    // If there's a search input on the page, focus it
    const searchInput = document.querySelector('input[type="search"], input[type="text"]');
    if (searchInput) {
      searchInput.focus();
    }
    
    logDebug("Page focus set");
  } catch (e) {
    logError("Error setting focus: " + e);
  }
}

// Check if this is our homepage tab by looking for the special hash
function isHomepageTab() {
  return window.location.href.includes('alwaysGoHomeSameTab');
}

// Mark this tab as the homepage tab if it has our special marker
function markHomepageTab() {
  try {
    // Check if this is our homepage
    if (window.location.href.includes("alwaysGoHomeSameTab")) {
      // Tell the background script this is our homepage tab
      chrome.runtime.sendMessage({ action: "markAsHomepageTab" }, function(response) {
        if (chrome.runtime.lastError) {
          logError("Error marking homepage tab: " + chrome.runtime.lastError.message);
          return;
        }
      });
    }
  } catch (e) {
    logError("Error in homepage tab marking: " + e);
  }
}

// Function to handle clicks on links when tab mode is active
function setupLinkHandlers() {
  // This will prevent multiple click handlers from processing the same click
  let processing = false;
  
  // Add a click event listener to the document
  document.addEventListener("click", function(event) {
    if (processing) return;
    
    chrome.storage.local.get(['sameTab'], function(data) {
      // If same-tab mode is not active, don't modify link behavior
      if (!data.sameTab) return;
      
      // Get the clicked element
      let target = event.target;
      
      // Check if the target or its parent is a link
      while (target && target !== document && target.tagName !== "A") {
        target = target.parentNode;
      }
      
      // If it's a link
      if (target && target.tagName === "A") {
        // Only handle links that would open in the same tab
        if (!target.getAttribute("target") || target.getAttribute("target") === "_self") {
          const href = target.getAttribute("href");
          
          // Skip if no href, javascript: links, or # links
          if (!href || href.startsWith("javascript:") || href === "#") return;
          
          // Skip if the link is downloading something
          if (target.getAttribute("download")) return;
          
          // Skip if modifier keys are pressed (user might want to open in new tab/window)
          if (event.ctrlKey || event.metaKey || event.shiftKey) return;
          
          // At this point, we have a regular link click in same-tab mode
          processing = true;
          
          // Prevent the default behavior
          event.preventDefault();
          
          // Open the link in a new window to avoid affecting our homepage tab
          try {
            window.open(href, "_blank");
          } catch (e) {
            // If popup blockers prevent opening, fall back to href
            logError("Failed to open link in new window: " + e);
            window.location.href = href;
          }
          
          // Reset processing flag after a delay
          setTimeout(function() {
            processing = false;
          }, 100);
        }
      }
    });
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Handle ensurePageFocus request
  if (message.action === 'ensurePageFocus') {
    ensurePageFocus();
    sendResponse({ success: true });
  }
});

// On page load, mark this as the homepage tab if it's our homepage
document.addEventListener("DOMContentLoaded", function() {
  // Mark this as the homepage tab if applicable
  markHomepageTab();
  
  // Set up link handlers for tab management
  setupLinkHandlers();
  
  // Check if we need to focus the page based on URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('focusOnLoad')) {
    // Use a slight delay to ensure the page is fully loaded
    setTimeout(ensurePageFocus, 300);
  }
});

// Also check when fully loaded (for late-loading content)
window.addEventListener('load', function() {
  if (isHomepageTab() && !processingClick) {
    // Check that a homepage is set before doing anything
    chrome.storage.local.get(['homepage'], function(data) {
      // Don't do anything if no valid homepage is set
      if (!isValidHomepage(data.homepage)) {
        return;
      }
      
      // Double-check our link handlers are set up
      setupLinkHandlers();
      
      // Ensure the page has focus again (sometimes it gets lost during page load)
      ensurePageFocus();
    });
  }
}); 