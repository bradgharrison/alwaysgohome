/**
 * AlwaysGoHome Extension - Background Script
 * Version: 1.0.1
 * Last updated: 2025-03-11
 */

// Note: We no longer need tab listeners since we're using chrome_url_overrides
// This keeps the extension more privacy-friendly by not requiring "tabs" permission

// When the extension is installed or the browser is updated
chrome.runtime.onInstalled.addListener(function() {
  // Initialize the hasRedirected flag to false
  chrome.storage.local.set({ hasRedirected: false });
});

// When the browser starts, reset the hasRedirected flag
chrome.runtime.onStartup.addListener(function() {
  // Reset the flag whenever the browser starts
  chrome.storage.local.set({ hasRedirected: false });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'checkRedirectStatus') {
    chrome.storage.local.get(['redirectOnce', 'hasRedirected'], function(data) {
      sendResponse({
        shouldRedirect: !data.redirectOnce || !data.hasRedirected
      });
    });
    
    return true; // Required for async sendResponse
  }
  
  if (message.action === 'markRedirected') {
    // Mark that we've redirected in this browser session
    chrome.storage.local.set({ hasRedirected: true });
  }
}); 