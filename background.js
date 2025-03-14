/**
 * AlwaysGoHome Extension - Background Script
 * Version: 2.1
 * Last updated: 2023-05-20
 */

// We'll use this to track our active homepage tab
let homepageTabId = null;
// Debug mode flag - set to true to enable verbose logging
const DEBUG_MODE = false;

// Function to log only critical errors
function logError(message) {
  console.error("[AlwaysGoHome Background]", message);
}

// Function to log important debug info
function logDebug(message) {
  if (DEBUG_MODE) {
    console.log("[AlwaysGoHome Background]", message);
  }
}

// Helper function to check if a URL is valid and non-empty
function isValidHomepage(url) {
  return url && typeof url === 'string' && url.trim() !== '';
}

// Helper function to format a URL with our special marker
function formatHomepageUrl(url) {
  if (!isValidHomepage(url)) return null;
  
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
  
  // Add a focus parameter to ensure the page gets focus
  if (url.includes('?')) {
    url += '&focusOnLoad=true';
  } else if (url.includes('#')) {
    // Insert the parameter before the hash
    let hashIndex = url.indexOf('#');
    url = url.substring(0, hashIndex) + '?focusOnLoad=true' + url.substring(hashIndex);
  } else {
    url += '?focusOnLoad=true';
  }
  
  return url;
}

// Function to ensure a tab has focus
function ensureTabFocus(tabId) {
  // Add a slight delay to make sure focus is set after navigation completes
  setTimeout(() => {
    // Tell the tab's content script to ensure focus
    chrome.tabs.sendMessage(tabId, { action: 'ensurePageFocus' }, function(response) {
      // We can ignore any response - tab might not have content script loaded yet
    });
  }, 300);
}

// Scan all open tabs to find our homepage tab by URL marker
function findHomepageTabByMarker(callback) {
  chrome.tabs.query({}, function(tabs) {
    let found = false;
    
    for (let tab of tabs) {
      if (tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
        homepageTabId = tab.id;
        found = true;
        break;
      }
    }
    
    if (!found) {
      homepageTabId = null;
    }
    
    if (callback) callback(found, homepageTabId);
  });
}

// Check if we should hijack a tab and make it our homepage
function maybeHijackTab(tabId) {
  // First check if we already have a homepage tab
  findHomepageTabByMarker(function(found, homepageId) {
    // Only if we don't have a homepage tab yet
    if (!found) {
      chrome.storage.local.get(['homepage', 'hasRedirected', 'redirectOnce', 'sameTab'], function(data) {
        // Skip everything if no homepage is set
        if (!isValidHomepage(data.homepage)) {
          return;
        }
        
        // Only redirect if we should (based on redirect once setting)
        if ((!data.redirectOnce || !data.hasRedirected) && data.sameTab) {
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
              
              // Ensure the tab gets focus
              ensureTabFocus(tabId);
            }
          });
        }
      });
    }
  });
}

// Check if a homepage tab is still on the correct URL
function verifyHomepageTab(callback) {
  if (homepageTabId === null) {
    // Try to find it first
    findHomepageTabByMarker(function(found, tabId) {
      if (!found) {
        callback(false);
        return;
      }
      
      // Continue with verification
      verifyHomepageTabById(tabId, callback);
    });
    return;
  }
  
  verifyHomepageTabById(homepageTabId, callback);
}

// Helper function to verify a specific tab
function verifyHomepageTabById(tabId, callback) {
  // Get the current tab info
  chrome.tabs.get(tabId, function(tab) {
    if (chrome.runtime.lastError) {
      // Tab doesn't exist anymore
      homepageTabId = null;
      callback(false);
      return;
    }
    
    // Get the homepage URL setting
    chrome.storage.local.get(['homepage'], function(data) {
      // If no homepage is set, don't continue with verification
      if (!isValidHomepage(data.homepage)) {
        callback(false);
        return;
      }
      
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
      
      callback(isOnHomepage, tab, data.homepage);
    });
  });
}

// Reset a tab back to the homepage
function resetTabToHomepage(tabId, homepageUrl) {
  // Don't do anything if the homepage URL is invalid
  if (!isValidHomepage(homepageUrl)) {
    return;
  }
  
  // Format the URL with our special marker
  let url = formatHomepageUrl(homepageUrl);
  
  // Update the tab
  chrome.tabs.update(tabId, { url: url }, function() {
    if (chrome.runtime.lastError) {
      logError("Failed to reset tab to homepage: " + chrome.runtime.lastError.message);
    } else {
      // Ensure the tab gets focus
      ensureTabFocus(tabId);
    }
  });
}

// When the extension is installed or the browser is updated
chrome.runtime.onInstalled.addListener(function() {
  // Initialize the hasRedirected flag to false
  chrome.storage.local.set({ hasRedirected: false });
  
  // Scan for any existing homepage tabs
  findHomepageTabByMarker();
});

// When the browser starts, reset the hasRedirected flag
chrome.runtime.onStartup.addListener(function() {
  // Reset the flag whenever the browser starts
  chrome.storage.local.set({ hasRedirected: false });
  // Reset our tab tracking
  homepageTabId = null;
  
  // Get the homepage to determine if we should perform any actions
  chrome.storage.local.get(['homepage'], function(data) {
    // Don't do anything if the homepage is not set
    if (!isValidHomepage(data.homepage)) {
      return;
    }
    
    // Find the first tab and hijack it
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs.length > 0) {
        maybeHijackTab(tabs[0].id);
      }
    });
    
    // Also scan for any existing homepage tabs
    findHomepageTabByMarker();
  });
});

// Listen for tab removal to update our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === homepageTabId) {
    homepageTabId = null;
  }
});

// Handle direct navigation to newtab page
chrome.tabs.onCreated.addListener((tab) => {
  // Check if we have a homepage set before doing anything
  chrome.storage.local.get(['homepage'], function(data) {
    // Don't do anything if the homepage is not set
    if (!isValidHomepage(data.homepage)) {
      return;
    }
    
    // First, check if we have a homepage tab and update our tracking if needed
    findHomepageTabByMarker(function(found, homepageId) {
      // If this is a newtab page and we already have a homepage tab
      if (tab.pendingUrl === "chrome://newtab/" && found) {
        // Verify our homepage tab is still on the correct URL
        verifyHomepageTabById(homepageId, function(isOnHomepage, existingTab, homepageUrl) {
          if (!isOnHomepage) {
            // If the tab has navigated away, reset it back to homepage
            resetTabToHomepage(homepageId, homepageUrl);
          }
          
          // Now focus on our homepage tab
          chrome.tabs.update(homepageId, { active: true }, () => {
            if (chrome.runtime.lastError) {
              logError("Failed to focus homepage tab: " + chrome.runtime.lastError.message);
              return;
            }
            
            // Ensure the tab gets focus
            ensureTabFocus(homepageId);
            
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
  });
});

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Handle redirect status check
  if (message.action === 'checkRedirectStatus') {
    // First check if we should be in single-tab mode
    chrome.storage.local.get(['redirectOnce', 'hasRedirected', 'homepage', 'sameTab'], function(data) {
      // If no homepage is set or single-tab mode is disabled, just use normal behavior (no redirect)
      if (!isValidHomepage(data.homepage) || !data.sameTab) {
        sendResponse({
          shouldRedirect: false,
          focusExistingTab: false
        });
        return;
      }
      
      // Scan all tabs to find our homepage
      findHomepageTabByMarker(function(found, homepageId) {
        // If we have a homepage tab and the message is from a new tab page
        if (found && sender.tab && 
            (sender.tab.pendingUrl === 'chrome://newtab/' || 
             (sender.tab.url && sender.tab.url.includes('chrome://newtab')))) {
          
          // First verify our homepage tab is still on the correct URL
          verifyHomepageTabById(homepageId, function(isOnHomepage, tab, homepageUrl) {
            if (!isOnHomepage) {
              // If the tab has navigated away, we'll reset it back to homepage
              sendResponse({
                shouldRedirect: false,
                focusExistingTab: true,
                homepageTabId: homepageId,
                resetUrl: true,
                resetToUrl: formatHomepageUrl(homepageUrl)
              });
            } else {
              // Still on homepage, just focus it
              sendResponse({
                shouldRedirect: false,
                focusExistingTab: true,
                homepageTabId: homepageId
              });
            }
          });
        } else {
          // For a new tab when there's no homepage tab yet, check if it's
          // the first tab and if so, mark it as the future homepage tab
          if (!found && !data.hasRedirected && data.homepage) {
            // We'll mark this as our future homepage tab
            homepageTabId = sender.tab.id;
          }
          
          sendResponse({
            shouldRedirect: !data.redirectOnce || !data.hasRedirected,
            focusExistingTab: false
          });
        }
      });
    });
    
    return true; // Required for async sendResponse
  }
  
  // Handle marking as homepage tab
  if (message.action === 'markAsHomepageTab') {
    // Verify we have a homepage set before marking anything
    chrome.storage.local.get(['homepage'], function(data) {
      if (!isValidHomepage(data.homepage)) {
        sendResponse({ success: false, error: 'No homepage set' });
        return;
      }
      
      // If sender is a tab, store its ID
      if (sender.tab) {
        homepageTabId = sender.tab.id;
        sendResponse({ success: true, tabId: homepageTabId });
      } else {
        sendResponse({ success: false, error: 'Not called from a tab' });
      }
    });
    
    return true;
  }
  
  // Handle tab existence check
  if (message.action === 'isHomepageTabOpen') {
    // Check if we have a homepage set first
    chrome.storage.local.get(['homepage'], function(data) {
      if (!isValidHomepage(data.homepage)) {
        sendResponse({ exists: false });
        return;
      }
      
      // Try to find any homepage tab by URL marker
      findHomepageTabByMarker(function(found, tabId) {
        if (found) {
          sendResponse({ exists: true, tabId: tabId });
        } else {
          sendResponse({ exists: false });
        }
      });
    });
    
    return true;
  }
  
  // Handle marking as redirected in this session
  if (message.action === 'markRedirected') {
    // Mark that we've redirected in this browser session
    chrome.storage.local.set({ hasRedirected: true });
  }
});

// Listen for tab updates to track our homepage
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If this is a complete load of a tab
  if (changeInfo.status === 'complete') {
    // Check if the URL contains our special marker
    if (tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
      homepageTabId = tabId;
      
      // If this is our homepage tab, ensure it has focus
      if (tab.active) {
        ensureTabFocus(tabId);
      }
    }
  }
}); 