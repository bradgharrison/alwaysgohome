/**
 * AlwaysGoHome Extension - Background Script
 * Version: 3.0.0
 * Last updated: 2024-03-19
 */

// Import the shared utilities
importScripts('utils.js');

// We'll use this to track our active homepage tab
let homepageTabId = null;

// Helper function to save homepage tab ID to storage
function saveHomepageTabId() {
  if (homepageTabId !== null) {
    chrome.storage.local.set({ homepageTabId: homepageTabId }, function() {
      logDebug('Background', "Saved homepage tab ID: " + homepageTabId);
    });
  } else {
    chrome.storage.local.remove(['homepageTabId'], function() {
      logDebug('Background', "Cleared saved homepage tab ID");
    });
  }
}

// Helper function to load homepage tab ID from storage
function loadHomepageTabId() {
  chrome.storage.local.get(['homepageTabId'], function(data) {
    if (data.homepageTabId) {
      // Verify the tab still exists and is our homepage
      chrome.tabs.get(data.homepageTabId, function(tab) {
        if (!chrome.runtime.lastError && tab && tab.url && hasHomepageMarker(tab.url)) {
          homepageTabId = data.homepageTabId;
          logDebug('Background', "Restored homepage tab ID: " + homepageTabId);
          // Verify the tab is still valid
          verifyHomepageTab(function(isOnHomepage) {
            if (!isOnHomepage) {
              homepageTabId = null;
              saveHomepageTabId();
              logDebug('Background', "Restored tab is no longer valid");
            }
          });
        } else {
          // Tab doesn't exist or isn't our homepage anymore
          homepageTabId = null;
          saveHomepageTabId();
          logDebug('Background', "Saved tab is no longer valid");
        }
      });
    }
  });
}

// Check if we should hijack a tab and make it our homepage
function maybeHijackTab(tabId) {
  // Only if we don't have a homepage tab yet
  if (homepageTabId === null) {
    chrome.storage.local.get(['homepage', 'hasRedirected', 'redirectOnce'], function(data) {
      // Only redirect if we should (based on redirect once setting)
      if (data.homepage && (!data.redirectOnce || !data.hasRedirected)) {
        logDebug('Background', "Hijacking tab " + tabId + " to become our homepage");
        
        // Make this our homepage tab
        homepageTabId = tabId;
        
        // Format the URL with our special marker
        let url = formatHomepageUrl(data.homepage);
        
        // Redirect the tab
        chrome.tabs.update(tabId, { url: url }, function() {
          if (chrome.runtime.lastError) {
            logError('Background', "Failed to hijack tab: " + chrome.runtime.lastError.message);
            homepageTabId = null;
          } else {
            // Mark that we've redirected in this session
            chrome.storage.local.set({ hasRedirected: true });
            logDebug('Background', "Successfully hijacked tab " + tabId);
          }
        });
      }
    });
  }
}

// Check if a homepage tab is still on the correct URL
function verifyHomepageTab(callback) {
  if (homepageTabId === null) {
    logDebug('Background', "No homepage tab to verify");
    callback(false);
    return;
  }
  
  // Get the current tab info
  chrome.tabs.get(homepageTabId, function(tab) {
    if (chrome.runtime.lastError) {
      // Tab doesn't exist anymore
      logDebug('Background', "Homepage tab doesn't exist anymore: " + chrome.runtime.lastError.message);
      homepageTabId = null;
      saveHomepageTabId();
      callback(false);
      return;
    }

    // Additional check for tab state
    if (tab.discarded || tab.status === 'unloaded') {
      logDebug('Background', "Homepage tab is discarded or unloaded, will reload it");
      chrome.tabs.reload(homepageTabId, function() {
        if (chrome.runtime.lastError) {
          logDebug('Background', "Failed to reload discarded tab: " + chrome.runtime.lastError.message);
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
        if (isLocalAddress(homepageUrl)) {
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
            logDebug('Background', "Error checking alternate protocol: " + e);
          }
        }
      } catch (e) {
        // Fallback to simple string comparison if URL parsing fails
        logError('Background', "Error parsing URLs: " + e);
        isOnHomepage = tabUrl.startsWith(homepageUrl);
      }
      
      logDebug('Background', "Homepage verification: Current=" + tabUrl + ", Should be=" + homepageUrl + ", Match=" + isOnHomepage);
      
      if (!isOnHomepage) {
        // Tab is no longer on our homepage
        // We could reset it, but it's better to just let the user navigate freely
        homepageTabId = null;
        saveHomepageTabId();
      }
      
      callback(isOnHomepage);
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
      logError('Background', "Failed to reset tab to homepage: " + chrome.runtime.lastError.message);
    } else {
      logDebug('Background', "Reset tab " + tabId + " back to homepage");
    }
  });
}

// Helper function to ensure tab focus is maintained
function ensureTabFocus(tabId) {
  // First focus the tab
  chrome.tabs.update(tabId, { active: true }, function() {
    if (chrome.runtime.lastError) {
      logError('Background', "Failed to focus tab: " + chrome.runtime.lastError.message);
      return;
    }

    // Only send one focus message - if the user is already typing, the content script will ignore it
    // Add proper error handling to the sendMessage call
    try {
      chrome.tabs.sendMessage(tabId, { action: 'ensurePageFocus' }, function(response) {
        // Handle potential errors from the message sending
        if (chrome.runtime.lastError) {
          // This is expected sometimes and not a critical error
          logDebug('Background', "Could not send focus message: " + chrome.runtime.lastError.message);
          
          // The tab might be in a state where the content script isn't loaded yet
          // Let's check if the tab is still valid and reload it if needed
          chrome.tabs.get(tabId, function(tab) {
            if (!chrome.runtime.lastError && tab) {
              if (tab.status === 'complete' && hasHomepageMarker(tab.url)) {
                // Tab is loaded but content script might not be ready
                // This is normal in some cases, so we don't need to do anything
              } else if (tab.status === 'unloaded' || tab.discarded) {
                // Tab was discarded by Chrome, reload it
                chrome.tabs.reload(tabId);
                logDebug('Background', "Reloading discarded tab");
              }
            }
          });
        }
      });
    } catch (e) {
      logError('Background', "Error sending focus message: " + e);
    }
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

// Enhanced state recovery with better tab tracking
function recoverState() {
  logDebug('Background', "Attempting to recover homepage state");
  
  // Always start with a scan for existing homepage tabs before trying to restore from storage
  chrome.tabs.query({}, function(allTabs) {
    // First look for any tab with our marker that's already open
    let existingHomepageTab = allTabs.find(tab => tab.url && hasHomepageMarker(tab.url));
    
    if (existingHomepageTab) {
      // Found an existing homepage tab, use it
      homepageTabId = existingHomepageTab.id;
      saveHomepageTabId();
      logDebug('Background', "Found existing homepage tab during recovery: " + existingHomepageTab.id);
      return;
    }
    
    // If no existing tab found, try to recover from stored state
    chrome.storage.local.get(['homepageState', 'homepage', 'sameTab'], function(data) {
      // Only proceed if we have stored homepage data and sameTab is enabled
      if (data.homepage && data.sameTab !== false) {
        const state = data.homepageState || { tabId: null };
        
        // Try to recover the exact tab by ID if we have it
        if (state.tabId !== null) {
          chrome.tabs.get(state.tabId, function(tab) {
            if (!chrome.runtime.lastError && tab) {
              // The tab exists, but check if it's still our homepage
              if (tab.url && hasHomepageMarker(tab.url)) {
                homepageTabId = tab.id;
                saveHomepageTabId();
                logDebug('Background', "Recovered exact homepage tab: " + tab.id);
                ensureTabFocus(tab.id);
                return;
              }
              
              // If the tab exists but isn't on our homepage, check if we should reset it
              if (data.sameTab) {
                // If same tab feature is enabled, redirect this tab back to the homepage
                let url = formatHomepageUrl(data.homepage);
                chrome.tabs.update(tab.id, { url: url }, function() {
                  if (!chrome.runtime.lastError) {
                    homepageTabId = tab.id;
                    saveHomepageTabId();
                    logDebug('Background', "Redirected existing tab back to homepage: " + tab.id);
                  } else {
                    // If we can't update this tab, we'll need to create a new one
                    createNewHomepageTab(data.homepage);
                  }
                });
                return;
              }
            }
            
            // If we couldn't recover the exact tab, check if any tab matches our last URL
            if (state.lastUrl) {
              const matchingTab = allTabs.find(t => t.url === state.lastUrl);
              if (matchingTab) {
                // Found a tab with matching URL but no marker, convert it
                let url = formatHomepageUrl(data.homepage);
                chrome.tabs.update(matchingTab.id, { url: url }, function() {
                  if (!chrome.runtime.lastError) {
                    homepageTabId = matchingTab.id;
                    saveHomepageTabId();
                    logDebug('Background', "Converted matching URL tab to homepage: " + matchingTab.id);
                  } else {
                    // If we can't update this tab, create a new one
                    createNewHomepageTab(data.homepage);
                  }
                });
                return;
              }
            }
            
            // If no suitable tab was found, create a new one only if sameTab is enabled
            if (data.sameTab) {
              createNewHomepageTab(data.homepage);
            }
          });
        } else {
          // No stored tab ID, check if we should create a new tab
          if (data.sameTab) {
            createNewHomepageTab(data.homepage);
          }
        }
      }
    });
  });
}

// Helper function to create a new homepage tab
function createNewHomepageTab(homepageUrl) {
  // Double-check that we don't already have a homepage tab
  chrome.tabs.query({}, function(tabs) {
    let existingTab = tabs.find(t => t.url && hasHomepageMarker(t.url));
    if (existingTab) {
      // Don't create a duplicate if one already exists
      homepageTabId = existingTab.id;
      saveHomepageTabId();
      logDebug('Background', "Found existing homepage tab, not creating duplicate: " + existingTab.id);
      ensureTabFocus(existingTab.id);
      return;
    }
    
    // Create a new tab with the homepage
    chrome.tabs.create({ 
      url: formatHomepageUrl(homepageUrl),
      active: true 
    }, function(tab) {
      if (!chrome.runtime.lastError) {
        homepageTabId = tab.id;
        saveHomepageTabId();
        logDebug('Background', "Created new homepage tab: " + tab.id);
      }
    });
  });
}

// Enhanced window focus handler
chrome.windows.onFocusChanged.addListener(function(windowId) {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    logDebug('Background', "Chrome window focused, recovering state");
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
  logDebug('Background', "Browser started, initializing recovery sequence");
  
  // Reset the redirect flag
  chrome.storage.local.set({ hasRedirected: false });
  
  // Try to recover state multiple times to handle slow tab restoration
  let recoveryAttempts = 0;
  const maxRecoveryAttempts = 5;
  
  function attemptRecovery() {
    recoveryAttempts++;
    logDebug('Background', "Recovery attempt " + recoveryAttempts);
    
    chrome.tabs.query({}, function(tabs) {
      // First look for our homepage tab
      let foundTab = tabs.find(tab => tab.url && tab.url.includes('alwaysGoHomeSameTab'));
      
      if (foundTab) {
        homepageTabId = foundTab.id;
        saveHomepageTabId();
        logDebug('Background', "Found homepage tab during recovery: " + foundTab.id);
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

// Handle when the extension is first installed or updated to a new version
chrome.runtime.onInstalled.addListener(function(details) {
  logDebug('Background', "Extension installed or updated: " + details.reason);
  
  if (details.reason === 'install') {
    // Set default settings on install
    chrome.storage.local.set({
      redirectOnce: false,
      sameTab: true,
      hasRedirected: false
    }, function() {
      logDebug('Background', "Default settings initialized");
    });
  } else if (details.reason === 'update') {
    // Reset session flag when updating
    chrome.storage.local.set({
      hasRedirected: false
    }, function() {
      logDebug('Background', "Reset hasRedirected flag after update");
    });
  }
  
  // Always try to load any saved homepage tab on install/update
  loadHomepageTabId();
});

// Listen for tab removal to update our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === homepageTabId) {
    homepageTabId = null;
    saveHomepageTabId();
    logDebug('Background', "Homepage tab was closed, tracking reset");
  }
});

// Enhanced tab creation handler
chrome.tabs.onCreated.addListener((newTab) => {
  // If this is a newtab page
  if (newTab.pendingUrl === "chrome://newtab/") {
    logDebug('Background', "New tab created, checking homepage status");
    
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
                  logError('Background', "Failed to close new tab: " + chrome.runtime.lastError.message);
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
                      logError('Background', "Failed to close new tab: " + chrome.runtime.lastError.message);
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
                  logError('Background', "Failed to close new tab: " + chrome.runtime.lastError.message);
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
              logError('Background', "Failed to close new tab: " + chrome.runtime.lastError.message);
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
            logDebug('Background', "Homepage tab has navigated away, will reset it when focused");
            
            sendResponse({
              shouldRedirect: false,
              focusExistingTab: true,
              homepageTabId: homepageTabId,
              resetUrl: true,
              resetToUrl: formatHomepageUrl(homepageUrl)
            });
          } else {
            // Still on homepage, just focus it
            logDebug('Background', "Homepage tab is still on correct URL, will focus it");
            
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
          logDebug('Background', "First tab scenario - will mark as homepage when redirected");
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
      logDebug('Background', "Marked tab " + homepageTabId + " as homepage tab");
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
          logDebug('Background', "Homepage tab doesn't exist anymore");
          sendResponse({ exists: false });
        } else {
          logDebug('Background', "Homepage tab exists: " + homepageTabId);
          sendResponse({ exists: true, tabId: homepageTabId });
        }
      });
    } else {
      logDebug('Background', "No homepage tab tracked");
      sendResponse({ exists: false });
    }
    return true;
  }
  
  // Handle marking as redirected in this session
  if (message.action === 'markRedirected') {
    // Mark that we've redirected in this browser session
    chrome.storage.local.set({ hasRedirected: true });
    logDebug('Background', "Marked as redirected in this session");
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
        logDebug('Background', "Homepage tab navigated away, tracking reset");
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
        logDebug('Background', "New homepage tab detected and tracked: " + tabId);
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
        logDebug('Background', "Found existing homepage tab: " + tab.id);
        foundHomepageTab = true;
        
        // Verify the found tab is actually valid
        verifyHomepageTab(function(isOnHomepage) {
          if (!isOnHomepage) {
            homepageTabId = null;
            saveHomepageTabId();
            logDebug('Background', "Found tab was not valid homepage");
          }
        });
        break;
      }
    }
    
    if (!foundHomepageTab) {
      homepageTabId = null;
      saveHomepageTabId();
      logDebug('Background', "No homepage tab found in any window");
    }
  });
}

// Also add a check when any window is created
chrome.windows.onCreated.addListener(function() {
  logDebug('Background', "New window created, verifying homepage tab");
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