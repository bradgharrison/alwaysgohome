/**
 * AlwaysGoHome Extension - Redirect Script
 * Version: 3.0.0
 * Last updated: 2024-03-19
 */

// Function to focus on an existing tab
function focusTab(tabId, resetUrl) {
  logDebug('Redirect', "Attempting to focus on existing homepage tab: " + tabId + (resetUrl ? " and reset URL" : ""));
  
  // If we need to reset the URL, we don't need to focus it separately
  // because the URL update will automatically focus the tab
  if (resetUrl) {
    // Just close this tab, the URL reset is handled by the background script
    closeCurrentTab();
    return;
  }
  
  chrome.tabs.update(tabId, { active: true }, function(tab) {
    if (chrome.runtime.lastError) {
      logError('Redirect', "Error focusing tab: " + chrome.runtime.lastError.message);
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
  logDebug('Redirect', "Closing current tab");
  
  // We need to delay slightly to avoid animation issues
  setTimeout(() => {
    try {
      chrome.tabs.getCurrent(function(currentTab) {
        if (chrome.runtime.lastError) {
          logError('Redirect', "Error getting current tab: " + chrome.runtime.lastError.message);
          return;
        }
        
        if (currentTab) {
          chrome.tabs.remove(currentTab.id, function() {
            if (chrome.runtime.lastError) {
              logError('Redirect', "Error closing tab: " + chrome.runtime.lastError.message);
            }
          });
        }
      });
    } catch (e) {
      logError('Redirect', "Error in tab closing: " + e);
    }
  }, 100);
}

// Check if we should redirect
function checkShouldRedirect(callback) {
  // Ask the background script if we should redirect
  chrome.runtime.sendMessage({ action: 'checkRedirectStatus' }, function(response) {
    if (chrome.runtime.lastError) {
      logError('Redirect', "Error checking redirect status: " + chrome.runtime.lastError.message);
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
  logDebug('Redirect', "Performing normal redirect to homepage");
  
  // Proceed with redirect
  chrome.storage.local.get(['homepage'], function(data) {
    if (chrome.runtime.lastError) {
      logError('Redirect', "Error retrieving homepage: " + chrome.runtime.lastError.message);
      // Just continue showing the spinner on error
      return;
    }
    
    if (data && data.homepage) {
      // For safety, check that the URL is valid and has a protocol
      try {
        // Use our shared function to format the URL
        const url = formatHomepageUrl(data.homepage);
        
        if (url) {
          logDebug('Redirect', "Redirecting to: " + url);
          // Perform the redirect
          window.location.href = url;
        } else {
          logError('Redirect', "Failed to format URL");
        }
      } catch (e) {
        logError('Redirect', "Error redirecting: " + e);
        // Just continue showing the spinner on error
      }
    } else {
      // No homepage set, but we still just show the spinner
      logError('Redirect', "No homepage set");
    }
  });
}

// Main redirect function
function attemptRedirect() {
  logDebug('Redirect', "Checking if we should redirect...");
  
  // Check if we should redirect
  checkShouldRedirect(function(shouldRedirect, shouldFocusTab, tabId, resetUrl, resetToUrl) {
    if (shouldFocusTab && tabId) {
      // Focus on the existing tab instead of redirecting
      focusTab(tabId, resetUrl);
    } else if (shouldRedirect) {
      // Normal redirect to homepage
      performNormalRedirect();
    } else {
      // Do nothing, just show the spinner
      logDebug('Redirect', "Not redirecting");
    }
  });
}

// Run the redirect code when the page is loaded
window.addEventListener('load', function() {
  logDebug('Redirect', "Redirect page loaded");
  attemptRedirect();
}); 