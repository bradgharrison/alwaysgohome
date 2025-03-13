/**
 * AlwaysGoHome Extension - Background Script
 * Version: 2.0
 * Last updated: 2025-03-12
 */

// We'll use this to track our active homepage tab
let homepageTabId = null;

// Function to log only critical errors
function logError(message) {
  console.error("[AlwaysGoHome Background]", message);
}

// Function to log debug info
function logDebug(message) {
  console.log("[AlwaysGoHome Background]", message);
}

// Helper function to format a URL with our special marker
function formatHomepageUrl(url) {
  if (!url) return null;
  
  // Make sure it has a protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/.test(url)) {
      url = 'http://' + url;
    } else {
      url = 'https://' + url;
    }
  }
  
  // Add our special marker
  if (url.indexOf('#') === -1) {
    url += '#alwaysGoHomeSameTab';
  } else {
    url += '&alwaysGoHomeSameTab';
  }
  
  return url;
}

// Check if we should hijack a tab and make it our homepage
function maybeHijackTab(tabId) {
  // Only if we don't have a homepage tab yet
  if (homepageTabId === null) {
    chrome.storage.local.get(['homepage', 'hasRedirected', 'redirectOnce'], function(data) {
      // Only redirect if we should (based on redirect once setting)
      if (data.homepage && (!data.redirectOnce || !data.hasRedirected)) {
        logDebug("Hijacking tab " + tabId + " to become our homepage");
        
        // Make this our homepage tab
        homepageTabId = tabId;
        
        // Format the URL with our special marker
        let url = formatHomepageUrl(data.homepage);
        
        // Redirect the tab
        chrome.tabs.update(tabId, { url: url }, function() {
          if (chrome.runtime.lastError) {
            logError("Failed to hijack tab: " + chrome.runtime.lastError.message);
            homepageTabId = null;
          } else {
            // Mark that we've redirected in this session
            chrome.storage.local.set({ hasRedirected: true });
            logDebug("Successfully hijacked tab " + tabId);
          }
        });
      }
    });
  }
}

// Check if a homepage tab is still on the correct URL
function verifyHomepageTab(callback) {
  if (homepageTabId === null) {
    callback(false);
    return;
  }
  
  // Get the current tab info
  chrome.tabs.get(homepageTabId, function(tab) {
    if (chrome.runtime.lastError) {
      // Tab doesn't exist anymore
      logDebug("Homepage tab doesn't exist anymore: " + chrome.runtime.lastError.message);
      homepageTabId = null;
      callback(false);
      return;
    }
    
    // Get the homepage URL setting
    chrome.storage.local.get(['homepage'], function(data) {
      // Check if the current tab URL matches our homepage (ignoring the special marker)
      let tabUrl = tab.url || "";
      let homepageUrl = data.homepage || "";
      
      // Strip our special marker for comparison
      tabUrl = tabUrl.replace(/#alwaysGoHomeSameTab|&alwaysGoHomeSameTab/g, '');
      
      // Format the homepage URL for comparison (adding protocol if needed)
      if (homepageUrl && !homepageUrl.startsWith('http://') && !homepageUrl.startsWith('https://')) {
        if (/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/.test(homepageUrl)) {
          homepageUrl = 'http://' + homepageUrl;
        } else {
          homepageUrl = 'https://' + homepageUrl;
        }
      }
      
      // Compare the base URLs (ignoring hash and query params)
      let isOnHomepage = false;
      
      try {
        // Try to use URL parsing for more accurate comparison
        let tabUrlObj = new URL(tabUrl);
        let homepageUrlObj = new URL(homepageUrl);
        
        // Compare the origins (protocol + domain + port)
        isOnHomepage = tabUrlObj.origin === homepageUrlObj.origin;
        
        // If homepage has a specific path, check that too
        if (isOnHomepage && homepageUrlObj.pathname !== "/" && homepageUrlObj.pathname !== "") {
          isOnHomepage = tabUrlObj.pathname === homepageUrlObj.pathname;
        }
      } catch (e) {
        // Fallback to simple string comparison if URL parsing fails
        logError("Error parsing URLs: " + e);
        isOnHomepage = tabUrl.startsWith(homepageUrl);
      }
      
      logDebug("Homepage verification: Current=" + tabUrl + ", Should be=" + homepageUrl + ", Match=" + isOnHomepage);
      callback(isOnHomepage, tab, data.homepage);
    });
  });
}

// Reset a tab back to the homepage
function resetTabToHomepage(tabId, homepageUrl) {
  // Format the URL with our special marker
  let url = formatHomepageUrl(homepageUrl);
  
  // Update the tab
  chrome.tabs.update(tabId, { url: url }, function() {
    if (chrome.runtime.lastError) {
      logError("Failed to reset tab to homepage: " + chrome.runtime.lastError.message);
    } else {
      logDebug("Reset tab " + tabId + " back to homepage");
    }
  });
}

// When the extension is installed or the browser is updated
chrome.runtime.onInstalled.addListener(function() {
  // Initialize the hasRedirected flag to false
  chrome.storage.local.set({ hasRedirected: false });
  logDebug("Extension installed/updated");
});

// When the browser starts, reset the hasRedirected flag
chrome.runtime.onStartup.addListener(function() {
  // Reset the flag whenever the browser starts
  chrome.storage.local.set({ hasRedirected: false });
  // Reset our tab tracking
  homepageTabId = null;
  logDebug("Browser started, reset flags");
  
  // Find the first tab and hijack it
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      logDebug("Found initial tab on startup: " + tabs[0].id);
      maybeHijackTab(tabs[0].id);
    }
  });
});

// Listen for tab removal to update our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === homepageTabId) {
    homepageTabId = null;
    logDebug("Homepage tab was closed, ID reset");
  }
});

// Handle direct navigation to newtab page
chrome.tabs.onCreated.addListener((tab) => {
  // If this is a newtab page and we already have a homepage tab
  if (tab.pendingUrl === "chrome://newtab/" && homepageTabId !== null) {
    // Verify our homepage tab is still on the correct URL
    verifyHomepageTab(function(isOnHomepage, existingTab, homepageUrl) {
      if (!isOnHomepage) {
        // If the tab has navigated away, reset it back to homepage
        logDebug("Homepage tab has navigated away, resetting it");
        resetTabToHomepage(homepageTabId, homepageUrl);
      }
      
      // Now focus on our homepage tab
      chrome.tabs.update(homepageTabId, { active: true }, () => {
        if (chrome.runtime.lastError) {
          logError("Failed to focus homepage tab: " + chrome.runtime.lastError.message);
          homepageTabId = null;
          return;
        }
        
        // Close the newly created tab
        chrome.tabs.remove(tab.id, () => {
          if (chrome.runtime.lastError) {
            logError("Failed to close new tab: " + chrome.runtime.lastError.message);
          }
        });
      });
    });
  }
});

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Handle redirect status check
  if (message.action === 'checkRedirectStatus') {
    chrome.storage.local.get(['redirectOnce', 'hasRedirected', 'homepage'], function(data) {
      // If we have a homepage tab and the message is from a new tab page
      if (homepageTabId !== null && sender.tab && 
          (sender.tab.pendingUrl === 'chrome://newtab/' || sender.tab.url.includes('chrome://newtab'))) {
        
        // First verify our homepage tab is still on the correct URL
        verifyHomepageTab(function(isOnHomepage, tab, homepageUrl) {
          if (!isOnHomepage) {
            // If the tab has navigated away, we'll reset it back to homepage
            logDebug("Homepage tab has navigated away, will reset it when focused");
            
            sendResponse({
              shouldRedirect: false,
              focusExistingTab: true,
              homepageTabId: homepageTabId,
              resetUrl: true,
              resetToUrl: formatHomepageUrl(homepageUrl)
            });
          } else {
            // Still on homepage, just focus it
            logDebug("Homepage tab is still on correct URL, will focus it");
            
            sendResponse({
              shouldRedirect: false,
              focusExistingTab: true,
              homepageTabId: homepageTabId
            });
          }
        });
        
        return true; // Keep the message channel open for async response
      } else {
        // For a new tab when there's no homepage tab yet, check if it's
        // the first tab and if so, mark it as the future homepage tab
        if (homepageTabId === null && !data.hasRedirected && data.homepage) {
          // We'll mark this as our future homepage tab
          logDebug("First tab scenario - will mark as homepage when redirected");
          homepageTabId = sender.tab.id;
        }
        
        sendResponse({
          shouldRedirect: !data.redirectOnce || !data.hasRedirected,
          focusExistingTab: false
        });
      }
    });
    
    return true; // Required for async sendResponse
  }
  
  // Handle marking as homepage tab
  if (message.action === 'markAsHomepageTab') {
    // If sender is a tab, store its ID
    if (sender.tab) {
      homepageTabId = sender.tab.id;
      logDebug("Marked tab " + homepageTabId + " as homepage tab");
      sendResponse({ success: true, tabId: homepageTabId });
    } else {
      sendResponse({ success: false, error: 'Not called from a tab' });
    }
    return true;
  }
  
  // Handle tab existence check
  if (message.action === 'isHomepageTabOpen') {
    if (homepageTabId !== null) {
      // Verify the tab still exists
      chrome.tabs.get(homepageTabId, function(tab) {
        if (chrome.runtime.lastError) {
          // Tab doesn't exist anymore
          homepageTabId = null;
          logDebug("Homepage tab doesn't exist anymore");
          sendResponse({ exists: false });
        } else {
          logDebug("Homepage tab exists: " + homepageTabId);
          sendResponse({ exists: true, tabId: homepageTabId });
        }
      });
    } else {
      logDebug("No homepage tab tracked");
      sendResponse({ exists: false });
    }
    return true;
  }
  
  // Handle marking as redirected in this session
  if (message.action === 'markRedirected') {
    // Mark that we've redirected in this browser session
    chrome.storage.local.set({ hasRedirected: true });
    logDebug("Marked as redirected in this session");
  }
});

// Listen for tab updates to track our homepage
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If this is a complete load of a tab
  if (changeInfo.status === 'complete') {
    // Check if the URL contains our special marker
    if (tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
      homepageTabId = tabId;
      logDebug("Tab " + tabId + " is now our homepage tab based on URL marker");
    }
  }
}); 