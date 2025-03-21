/**
 * AlwaysGoHome Extension - Redirect Script
 * Version: 3.0.1
 * Last updated: 2024-03-20
 */

// Debug mode flag - set to true to enable verbose logging
const DEBUG_MODE = false;

// Function to log errors
function logError(message) {
  console.error("[AlwaysGoHome Redirect]", message);
}

// Function to log debug info
function logDebug(message) {
  if (DEBUG_MODE) {
    console.log("[AlwaysGoHome Redirect]", message);
  }
}

// Helper function to check if a URL is valid and non-empty
function isValidHomepage(url) {
  return url && typeof url === 'string' && url.trim() !== '';
}

// Check if we should redirect
function checkShouldRedirect() {
  return new Promise((resolve) => {
    // First check if single-tab mode is enabled
    chrome.storage.local.get(['sameTab'], function(sameTabData) {
      // If single-tab mode is disabled, use simple redirect logic
      if (!sameTabData.sameTab) {
        chrome.storage.local.get(['homepage', 'redirectOnce', 'hasRedirected'], function(data) {
          // Ensure we have a valid homepage before doing anything
          if (!isValidHomepage(data.homepage)) {
            resolve({ shouldRedirect: false });
            return;
          }
          
          resolve({
            shouldRedirect: !data.redirectOnce || !data.hasRedirected,
            homepage: data.homepage
          });
        });
        return;
      }
      
      // For single-tab mode, we need more sophisticated checks
      chrome.runtime.sendMessage({ action: 'checkRedirectStatus' }, function(response) {
        if (chrome.runtime.lastError) {
          logError("Error checking redirect status: " + chrome.runtime.lastError.message);
          resolve({ shouldRedirect: false });
          return;
        }
        
        if (response) {
          resolve(response);
        } else {
          resolve({ shouldRedirect: false });
        }
      });
    });
  });
}

// Perform normal redirect
function performNormalRedirect() {
  chrome.storage.local.get(['homepage', 'sameTab'], function(data) {
    // Ensure we have a valid homepage before redirecting
    if (!isValidHomepage(data.homepage)) {
      return;
    }
    
    // Get our homepage URL
    let homepageUrl = data.homepage;
    
    // Make sure it has a protocol
    if (!homepageUrl.startsWith('http://') && !homepageUrl.startsWith('https://')) {
      if (/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/.test(homepageUrl)) {
        homepageUrl = 'http://' + homepageUrl;
      } else {
        homepageUrl = 'https://' + homepageUrl;
      }
    }
    
    // Add our special hash for single-tab tracking if in sameTab mode
    if (data.sameTab) {
      if (homepageUrl.indexOf('#') === -1) {
        homepageUrl += '#alwaysGoHomeSameTab';
      } else {
        homepageUrl += '&alwaysGoHomeSameTab';
      }
      
      // Add a focus parameter
      if (homepageUrl.includes('?')) {
        homepageUrl += '&focusOnLoad=true';
      } else if (homepageUrl.includes('#')) {
        // Insert before the hash
        let hashIndex = homepageUrl.indexOf('#');
        homepageUrl = homepageUrl.substring(0, hashIndex) + '?focusOnLoad=true' + homepageUrl.substring(hashIndex);
      } else {
        homepageUrl += '?focusOnLoad=true';
      }
    }
    
    // Mark that we've redirected in this session
    chrome.runtime.sendMessage({ action: 'markRedirected' });
    
    // Try to focus the window right before navigating
    try {
      window.focus();
      document.body.focus();
    } catch (e) {
      logError("Error focusing window: " + e);
    }
    
    // Perform the redirect
    window.location.href = homepageUrl;
  });
}

// Focus on an existing tab
function focusExistingTab(tabId, resetUrl, resetToUrl) {
  chrome.tabs.update(tabId, { active: true }, function() {
    if (chrome.runtime.lastError) {
      logError("Failed to focus tab: " + chrome.runtime.lastError.message);
      return;
    }
    
    // Tell the tab to ensure focus
    chrome.tabs.sendMessage(tabId, { action: 'ensurePageFocus' }, function(response) {
      // Ignore any response errors - tab might not have content script loaded yet
    });
    
    // Reset the URL if needed
    if (resetUrl && resetToUrl) {
      chrome.tabs.update(tabId, { url: resetToUrl });
    }
    
    // Close the current tab
    chrome.tabs.getCurrent(function(tab) {
      if (tab) {
        chrome.tabs.remove(tab.id, function() {
          if (chrome.runtime.lastError) {
            logError("Failed to close tab: " + chrome.runtime.lastError.message);
          }
        });
      }
    });
  });
}

// Check if we should redirect on page load
(async function() {
  try {
    // If this is not a newtab page, we don't need to do anything
    if (!window.location.href.includes('chrome://newtab')) {
      return;
    }
    
    const result = await checkShouldRedirect();
    
    if (result.shouldRedirect) {
      performNormalRedirect();
    } else if (result.focusExistingTab && result.homepageTabId) {
      // Focus the existing homepage tab instead
      focusExistingTab(result.homepageTabId, result.resetUrl, result.resetToUrl);
    }
  } catch (e) {
    logError("Error in redirect logic: " + e);
  }
})(); 