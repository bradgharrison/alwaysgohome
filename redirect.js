/**
 * AlwaysGoHome Extension - Redirect Script
 * Version: 2.0
 * Last updated: 2025-03-12
 */

// Constants
const LOCAL_ADDRESS_PATTERN = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/;

// Function to log only critical errors
function logError(message) {
  console.error("[AlwaysGoHome Redirect]", message);
}

// Function to log debug info
function logDebug(message) {
  console.log("[AlwaysGoHome Redirect]", message);
}

// Function to focus on an existing tab
function focusTab(tabId, resetUrl) {
  logDebug("Attempting to focus on existing homepage tab: " + tabId + (resetUrl ? " and reset URL" : ""));
  
  // If we need to reset the URL, we don't need to focus it separately
  // because the URL update will automatically focus the tab
  if (resetUrl) {
    // Just close this tab, the URL reset is handled by the background script
    closeCurrentTab();
    return;
  }
  
  chrome.tabs.update(tabId, { active: true }, function(tab) {
    if (chrome.runtime.lastError) {
      logError("Error focusing tab: " + chrome.runtime.lastError.message);
      // If we can't focus the tab, proceed with normal redirect
      performNormalRedirect();
      return;
    }
    
    // Close this tab since we've focused the other one
    closeCurrentTab();
  });
}

// Helper function to close the current tab
function closeCurrentTab() {
  logDebug("Closing current tab");
  
  // We need to delay slightly to avoid animation issues
  setTimeout(() => {
    try {
      chrome.tabs.getCurrent(function(currentTab) {
        if (chrome.runtime.lastError) {
          logError("Error getting current tab: " + chrome.runtime.lastError.message);
          return;
        }
        
        if (currentTab) {
          chrome.tabs.remove(currentTab.id, function() {
            if (chrome.runtime.lastError) {
              logError("Error closing tab: " + chrome.runtime.lastError.message);
            }
          });
        }
      });
    } catch (e) {
      logError("Error in tab closing: " + e);
    }
  }, 100);
}

// Check if we should redirect
function checkShouldRedirect(callback) {
  // Ask the background script if we should redirect
  chrome.runtime.sendMessage({ action: 'checkRedirectStatus' }, function(response) {
    if (chrome.runtime.lastError) {
      logError("Error checking redirect status: " + chrome.runtime.lastError.message);
      // Default to redirect if there's an error
      callback(true, false, null, false, null);
      return;
    }
    
    if (response) {
      if (response.focusExistingTab && response.homepageTabId) {
        // Focus on existing tab instead of redirecting
        // If resetUrl is true, we need to reset the URL as well
        callback(false, true, response.homepageTabId, response.resetUrl || false, response.resetToUrl);
      } else {
        // Normal redirect behavior
        callback(response.shouldRedirect, false, null, false, null);
      }
    } else {
      callback(false, false, null, false, null);
    }
  });
}

// Function to perform the normal redirect to homepage
function performNormalRedirect() {
  // Mark that we've redirected in this session
  chrome.runtime.sendMessage({ action: 'markRedirected' });
  logDebug("Performing normal redirect to homepage");
  
  // Proceed with redirect
  chrome.storage.local.get(['homepage'], function(data) {
    if (chrome.runtime.lastError) {
      logError("Error retrieving homepage: " + chrome.runtime.lastError.message);
      // Just continue showing the spinner on error
      return;
    }
    
    if (data && data.homepage) {
      // For safety, check that the URL is valid and has a protocol
      try {
        var url = data.homepage;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          // Auto-detect if it's likely a local address
          if (LOCAL_ADDRESS_PATTERN.test(url)) {
            url = 'http://' + url;
          } else {
            url = 'https://' + url;
          }
        }
        
        // Always add our special hash for single-tab tracking
        if (url.indexOf('#') === -1) {
          url += '#alwaysGoHomeSameTab';
        } else {
          url += '&alwaysGoHomeSameTab';
        }
        
        logDebug("Redirecting to: " + url);
        
        // Perform the redirect
        window.location.href = url;
      } catch (e) {
        logError("Error redirecting: " + e);
        // Just continue showing the spinner on error
      }
    } else {
      // No homepage set, but we still just show the spinner
      logError("No homepage set");
    }
  });
}

// Main redirect function
function attemptRedirect() {
  logDebug("Checking if we should redirect...");
  
  // Check if we should redirect
  checkShouldRedirect(function(shouldRedirect, shouldFocusTab, tabId, shouldResetUrl, resetUrl) {
    if (shouldFocusTab && tabId) {
      logDebug("Should focus on existing tab instead of redirecting" + (shouldResetUrl ? " and reset URL" : ""));
      focusTab(tabId, shouldResetUrl);
    } else if (shouldRedirect) {
      logDebug("Should redirect to homepage");
      performNormalRedirect();
    } else {
      logDebug("Should not redirect - showing default new tab");
      useDefaultBrowserBehavior();
    }
  });
}

// Function to use default browser behavior
function useDefaultBrowserBehavior() {
  logDebug("Using default browser behavior for new tab");
  
  // Remove the spinner and any other content
  document.body.innerHTML = '';
  document.body.style.background = ''; // Remove our background styling
  
  // Apply styling to make it look like a blank page
  document.documentElement.style.background = 'white';
  document.documentElement.style.height = '100%';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.height = '100%';
  
  // Apply dark mode if user prefers it
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.style.background = '#202124'; // Chrome's dark mode background
  }
  
  // Add a favicon link to match Chrome's default
  var link = document.createElement('link');
  link.rel = 'icon';
  link.href = 'data:,'; // Empty favicon
  document.head.appendChild(link);
  
  // Set empty title
  document.title = 'New Tab';
}

// When document is ready
window.addEventListener('DOMContentLoaded', function() {
  logDebug("DOMContentLoaded event fired");
  // Attempt redirect
  attemptRedirect();
});

// Also attempt redirect on window load in case DOMContentLoaded was missed
window.addEventListener('load', function() {
  logDebug("Window load event fired");
  // Check if we're still on the redirect page after 100ms
  setTimeout(function() {
    if (window.location.href.includes('redirect.html')) {
      logDebug("Still on redirect page, attempting redirect again");
      attemptRedirect();
    }
  }, 100);
}); 