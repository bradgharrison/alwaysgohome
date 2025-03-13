/**
 * AlwaysGoHome Extension - Popup Script
 * Version: 1.2
 * Last updated: 2025-03-12
 */

// Constants
const LOCAL_ADDRESS_PATTERN = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/;

// Log critical errors only
function logError(message) {
  console.error("[AlwaysGoHome]", message);
}

// Show status message to the user
function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  if (!statusElement) return;
  
  statusElement.textContent = message;
  statusElement.className = type || "success";
  
  // Clear after 3 seconds
  if (message) {
    setTimeout(function() {
      statusElement.textContent = '';
    }, 3000);
  }
}

// Process the URL based on user input and protocol preferences
function processUrl(inputUrl) {
  if (!inputUrl) return '';
  inputUrl = inputUrl.trim();
  
  // If URL already has a protocol, leave it as is
  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
    return inputUrl;
  }
  
  // Check if HTTP protocol is specifically selected
  var useHttp = document.getElementById('use-http') && document.getElementById('use-http').checked;
  
  // If it's a local IP address or localhost, use HTTP by default
  var isLocalAddress = LOCAL_ADDRESS_PATTERN.test(inputUrl);
  
  // Apply the protocol
  if (useHttp || isLocalAddress) {
    return 'http://' + inputUrl;
  } else {
    return 'https://' + inputUrl;
  }
}

// When the document is ready
document.addEventListener('DOMContentLoaded', function() {
  // When the save button is clicked, save the settings
  document.getElementById('save').addEventListener('click', function() {
    var inputUrl = document.getElementById('url').value.trim();
    var redirectOnce = document.getElementById('redirect-once').checked;
    
    if (inputUrl) {
      var url = processUrl(inputUrl);
      showStatus("Saving...");
      
      // Save directly to Chrome storage
      chrome.storage.local.set({
        homepage: url,
        redirectOnce: redirectOnce
      }, function() {
        if (chrome.runtime.lastError) {
          logError("Error saving: " + chrome.runtime.lastError.message);
          showStatus("Error saving!", "error");
          return;
        }
        
        showStatus("Saved!", "success");
      });
    } else {
      showStatus("Please enter a URL", "error");
    }
  });

  // Initialize the popup
  initPopup();
  
  // Setup protocol auto-detection
  var urlInput = document.getElementById('url');
  urlInput.addEventListener('input', function() {
    var val = urlInput.value.trim();
    var httpCheckbox = document.getElementById('use-http');
    
    // Auto-check HTTP for local addresses
    if (httpCheckbox && LOCAL_ADDRESS_PATTERN.test(val)) {
      httpCheckbox.checked = true;
    }
    
    // If protocol is already in the input, adjust the checkbox
    if (val.startsWith('http://')) {
      httpCheckbox.checked = true;
    } else if (val.startsWith('https://')) {
      httpCheckbox.checked = false;
    }
  });
});

// Initialize the popup
function initPopup() {
  // Get all settings from storage
  chrome.storage.local.get(['homepage', 'redirectOnce'], function(data) {
    if (chrome.runtime.lastError) {
      logError("Error getting settings: " + chrome.runtime.lastError.message);
      showStatus("Error loading settings", "error");
      return;
    }
    
    // Set the URL input field
    if (data.homepage) {
      document.getElementById('url').value = data.homepage;
      
      // Set the HTTP checkbox based on the saved URL
      if (document.getElementById('use-http')) {
        document.getElementById('use-http').checked = data.homepage.startsWith('http://');
      }
    }
    
    // Set redirect once checkbox
    document.getElementById('redirect-once').checked = !!data.redirectOnce;
  });
} 