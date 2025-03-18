/**
 * AlwaysGoHome Extension - Background Script
 * Version: 2.1.0-beta
 * Last updated: 2024-03-12
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

// Helper function to save homepage tab ID to storage
function saveHomepageTabId() {
  if (homepageTabId !== null) {
    chrome.storage.local.set({ homepageTabId: homepageTabId }, function() {
      logDebug("Saved homepage tab ID: " + homepageTabId);
    });
  } else {
    chrome.storage.local.remove(['homepageTabId'], function() {
      logDebug("Cleared saved homepage tab ID");
    });
  }
}

// Helper function to load homepage tab ID from storage
function loadHomepageTabId() {
  chrome.storage.local.get(['homepageTabId'], function(data) {
    if (data.homepageTabId) {
      // Verify the tab still exists and is our homepage
      chrome.tabs.get(data.homepageTabId, function(tab) {
        if (!chrome.runtime.lastError && tab && tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
          homepageTabId = data.homepageTabId;
          logDebug("Restored homepage tab ID: " + homepageTabId);
          // Verify the tab is still valid
          verifyHomepageTab(function(isOnHomepage) {
            if (!isOnHomepage) {
              homepageTabId = null;
              saveHomepageTabId();
              logDebug("Restored tab is no longer valid");
            }
          });
        } else {
          // Tab doesn't exist or isn't our homepage anymore
          homepageTabId = null;
          saveHomepageTabId();
          logDebug("Saved tab is no longer valid");
        }
      });
    }
  });
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
    logDebug("No homepage tab to verify");
    callback(false);
    return;
  }
  
  // Get the current tab info
  chrome.tabs.get(homepageTabId, function(tab) {
    if (chrome.runtime.lastError) {
      // Tab doesn't exist anymore
      logDebug("Homepage tab doesn't exist anymore: " + chrome.runtime.lastError.message);
      homepageTabId = null;
      saveHomepageTabId();
      callback(false);
      return;
    }

    // Additional check for tab state
    if (tab.discarded || tab.status === 'unloaded') {
      logDebug("Homepage tab is discarded or unloaded, will reload it");
      chrome.tabs.reload(homepageTabId, function() {
        if (chrome.runtime.lastError) {
          logDebug("Failed to reload discarded tab: " + chrome.runtime.lastError.message);
          homepageTabId = null;
          saveHomepageTabId();
          callback(false);
          return;
        }
      });
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

        // If the verification fails, check if it's just a protocol mismatch (http vs https)
        if (!isOnHomepage) {
          const alternateProtocol = tabUrlObj.protocol === 'https:' ? 'http:' : 'https:';
          const alternateUrl = tabUrlObj.href.replace(tabUrlObj.protocol, alternateProtocol);
          try {
            const alternateUrlObj = new URL(alternateUrl);
            isOnHomepage = alternateUrlObj.origin.replace(alternateProtocol, '') === homepageUrlObj.origin.replace(homepageUrlObj.protocol, '');
          } catch (e) {
            logDebug("Error checking alternate protocol: " + e);
          }
        }
      } catch (e) {
        // Fallback to simple string comparison if URL parsing fails
        logError("Error parsing URLs: " + e);
        isOnHomepage = tabUrl.startsWith(homepageUrl);
      }
      
      logDebug("Homepage verification: Current=" + tabUrl + ", Should be=" + homepageUrl + ", Match=" + isOnHomepage);
      
      if (!isOnHomepage) {
        homepageTabId = null;
        saveHomepageTabId();
      }
      
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

// Helper function to ensure tab focus is maintained
function ensureTabFocus(tabId) {
  // First focus the tab
  chrome.tabs.update(tabId, { active: true }, function() {
    if (chrome.runtime.lastError) {
      logError("Failed to focus tab: " + chrome.runtime.lastError.message);
      return;
    }

    // Only send one focus message - if the user is already typing, the content script will ignore it
    chrome.tabs.sendMessage(tabId, { action: 'ensurePageFocus' });
  });
}

// Add persistent state management
function saveState() {
  chrome.storage.local.set({
    homepageState: {
      tabId: homepageTabId,
      lastSaved: Date.now(),
      lastUrl: null  // Will be populated if we have a valid tab
    }
  }, function() {
    if (homepageTabId !== null) {
      chrome.tabs.get(homepageTabId, function(tab) {
        if (!chrome.runtime.lastError && tab && tab.url) {
          chrome.storage.local.set({
            homepageState: {
              tabId: homepageTabId,
              lastSaved: Date.now(),
              lastUrl: tab.url
            }
          });
        }
      });
    }
  });
}

// Enhanced state recovery
function recoverState() {
  logDebug("Attempting to recover homepage state");
  chrome.storage.local.get(['homepageState', 'homepage'], function(data) {
    if (data.homepageState && data.homepage) {
      const state = data.homepageState;
      
      // First try to recover the exact tab
      if (state.tabId !== null) {
        chrome.tabs.get(state.tabId, function(tab) {
          if (!chrome.runtime.lastError && tab) {
            if (tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
              homepageTabId = tab.id;
              saveHomepageTabId();
              logDebug("Recovered exact homepage tab: " + tab.id);
              return;
            }
          }
          
          // If exact tab recovery failed, scan all tabs
          chrome.tabs.query({}, function(tabs) {
            let foundTab = false;
            for (let tab of tabs) {
              if (tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
                // Found a tab with our marker
                homepageTabId = tab.id;
                saveHomepageTabId();
                logDebug("Found alternative homepage tab: " + tab.id);
                foundTab = true;
                break;
              } else if (tab.url && state.lastUrl && tab.url === state.lastUrl) {
                // Found a tab with matching URL but no marker
                homepageTabId = tab.id;
                saveHomepageTabId();
                logDebug("Found tab with matching URL: " + tab.id);
                foundTab = true;
                break;
              }
            }
            
            if (!foundTab) {
              logDebug("No valid homepage tab found, will create new one");
              homepageTabId = null;
              saveHomepageTabId();
              // Create a new tab with the homepage
              chrome.tabs.create({ 
                url: formatHomepageUrl(data.homepage),
                active: true 
              }, function(tab) {
                if (!chrome.runtime.lastError) {
                  homepageTabId = tab.id;
                  saveHomepageTabId();
                  logDebug("Created new homepage tab: " + tab.id);
                }
              });
            }
          });
        });
      } else {
        scanForHomepageTab();
      }
    }
  });
}

// Enhanced window focus handler
chrome.windows.onFocusChanged.addListener(function(windowId) {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    logDebug("Chrome window focused, recovering state");
    recoverState();
  }
});

// Save state periodically
setInterval(saveState, 30000); // Save state every 30 seconds

// Save state when tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === homepageTabId && changeInfo.status === 'complete') {
    saveState();
  }
});

// Enhanced startup handling with multiple recovery attempts
chrome.runtime.onStartup.addListener(function() {
  logDebug("Browser started, initializing recovery sequence");
  
  // Reset the redirect flag
  chrome.storage.local.set({ hasRedirected: false });
  
  // Try to recover state multiple times to handle slow tab restoration
  let recoveryAttempts = 0;
  const maxRecoveryAttempts = 5;
  
  function attemptRecovery() {
    recoveryAttempts++;
    logDebug("Recovery attempt " + recoveryAttempts);
    
    chrome.tabs.query({}, function(tabs) {
      // First look for our homepage tab
      let foundTab = tabs.find(tab => tab.url && tab.url.includes('alwaysGoHomeSameTab'));
      
      if (foundTab) {
        homepageTabId = foundTab.id;
        saveHomepageTabId();
        logDebug("Found homepage tab during recovery: " + foundTab.id);
        saveState();
      } else if (recoveryAttempts < maxRecoveryAttempts) {
        // If we haven't found it yet and haven't hit max attempts, try again
        setTimeout(attemptRecovery, 2000);
      } else {
        // If we've hit max attempts, try one last time with state recovery
        recoverState();
      }
    });
  }
  
  // Start the recovery sequence
  setTimeout(attemptRecovery, 1000);
});

// Also recover on install/update
chrome.runtime.onInstalled.addListener(function() {
  logDebug("Extension installed/updated, recovering state");
  chrome.storage.local.set({ hasRedirected: false });
  recoverState();
});

// Listen for tab removal to update our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === homepageTabId) {
    homepageTabId = null;
    saveHomepageTabId();
    logDebug("Homepage tab was closed, tracking reset");
  }
});

// Enhanced tab creation handler
chrome.tabs.onCreated.addListener((newTab) => {
  // If this is a newtab page
  if (newTab.pendingUrl === "chrome://newtab/") {
    logDebug("New tab created, checking homepage status");
    
    // First check if we already have a homepage tab
    if (homepageTabId !== null) {
      chrome.tabs.get(homepageTabId, function(existingTab) {
        if (!chrome.runtime.lastError && existingTab) {
          // Verify it's still our homepage
          verifyHomepageTab(function(isOnHomepage, homeTab, homepageUrl) {
            if (isOnHomepage) {
              // If it's valid, focus it and close the new tab
              ensureTabFocus(homepageTabId);
              chrome.tabs.remove(newTab.id, function() {
                if (chrome.runtime.lastError) {
                  logError("Failed to close new tab: " + chrome.runtime.lastError.message);
                }
              });
            } else {
              // If it's not valid, scan for any other homepage tabs before creating new one
              chrome.tabs.query({}, function(tabs) {
                let foundTab = tabs.find(t => t.url && t.url.includes('alwaysGoHomeSameTab'));
                if (foundTab) {
                  // Found another homepage tab, use it
                  homepageTabId = foundTab.id;
                  saveHomepageTabId();
                  ensureTabFocus(foundTab.id);
                  chrome.tabs.remove(newTab.id, function() {
                    if (chrome.runtime.lastError) {
                      logError("Failed to close new tab: " + chrome.runtime.lastError.message);
                    }
                  });
                } else {
                  // No valid homepage tab found, let this one become homepage
                  homepageTabId = newTab.id;
                  saveHomepageTabId();
                }
              });
            }
          });
        } else {
          // If our tracked tab doesn't exist, scan for any other homepage tabs
          chrome.tabs.query({}, function(tabs) {
            let foundTab = tabs.find(t => t.url && t.url.includes('alwaysGoHomeSameTab'));
            if (foundTab) {
              // Found another homepage tab, use it
              homepageTabId = foundTab.id;
              saveHomepageTabId();
              ensureTabFocus(foundTab.id);
              chrome.tabs.remove(newTab.id, function() {
                if (chrome.runtime.lastError) {
                  logError("Failed to close new tab: " + chrome.runtime.lastError.message);
                }
              });
            } else {
              // No valid homepage tab found, let this one become homepage
              homepageTabId = newTab.id;
              saveHomepageTabId();
            }
          });
        }
      });
    } else {
      // If we're not tracking a homepage tab, check if one exists anyway
      chrome.tabs.query({}, function(tabs) {
        let foundTab = tabs.find(t => t.url && t.url.includes('alwaysGoHomeSameTab'));
        if (foundTab) {
          // Found a homepage tab, use it
          homepageTabId = foundTab.id;
          saveHomepageTabId();
          ensureTabFocus(foundTab.id);
          chrome.tabs.remove(newTab.id, function() {
            if (chrome.runtime.lastError) {
              logError("Failed to close new tab: " + chrome.runtime.lastError.message);
            }
          });
        } else {
          // No homepage tab exists, let this one become homepage
          homepageTabId = newTab.id;
          saveHomepageTabId();
        }
      });
    }
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

// Listen for tab updates to maintain tracking
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // If this is our tracked tab
    if (tabId === homepageTabId) {
      // Verify it's still on our homepage
      if (!tab.url || !tab.url.includes('alwaysGoHomeSameTab')) {
        homepageTabId = null;
        saveHomepageTabId();
        logDebug("Homepage tab navigated away, tracking reset");
      } else if (tab.active) {
        // If this is our homepage and it's active, ensure it maintains focus
        ensureTabFocus(tabId);
      }
    }
    // If this tab has our marker but isn't tracked
    else if (tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
      // If we're not tracking any tab, or this is a more recent homepage
      if (homepageTabId === null) {
        homepageTabId = tabId;
        saveHomepageTabId();
        logDebug("New homepage tab detected and tracked: " + tabId);
        if (tab.active) {
          ensureTabFocus(tabId);
        }
      }
    }
  }
});

// Helper function to scan all tabs for a homepage tab
function scanForHomepageTab() {
  chrome.tabs.query({}, function(tabs) {
    let foundHomepageTab = false;
    for (let tab of tabs) {
      if (tab.url && tab.url.includes('alwaysGoHomeSameTab')) {
        homepageTabId = tab.id;
        saveHomepageTabId();
        logDebug("Found existing homepage tab: " + tab.id);
        foundHomepageTab = true;
        
        // Verify the found tab is actually valid
        verifyHomepageTab(function(isOnHomepage) {
          if (!isOnHomepage) {
            homepageTabId = null;
            saveHomepageTabId();
            logDebug("Found tab was not valid homepage");
          }
        });
        break;
      }
    }
    
    if (!foundHomepageTab) {
      homepageTabId = null;
      saveHomepageTabId();
      logDebug("No homepage tab found in any window");
    }
  });
}

// Also add a check when any window is created
chrome.windows.onCreated.addListener(function() {
  logDebug("New window created, verifying homepage tab");
  if (homepageTabId !== null) {
    verifyHomepageTab(function(isOnHomepage) {
      if (!isOnHomepage) {
        scanForHomepageTab();
      }
    });
  } else {
    scanForHomepageTab();
  }
}); 