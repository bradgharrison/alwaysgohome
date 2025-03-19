/**
 * AlwaysGoHome Extension - Popup Script
 * Version: 3.0.0
 * Last updated: 2024-03-19
 */

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
  const useHttp = document.getElementById('use-http') && document.getElementById('use-http').checked;
  
  // If it's a local IP address or localhost, use HTTP by default
  const isLocalAddr = isLocalAddress(inputUrl);
  
  // Apply the protocol
  if (useHttp || isLocalAddr) {
    return 'http://' + inputUrl;
  } else {
    return 'https://' + inputUrl;
  }
}

// When the document is ready
document.addEventListener('DOMContentLoaded', function() {
  // When the save button is clicked, save the settings
  document.getElementById('save').addEventListener('click', function() {
    const inputUrl = document.getElementById('url').value.trim();
    const redirectOnce = document.getElementById('redirect-once').checked;
    const sameTab = document.getElementById('same-tab').checked;
    
    if (inputUrl) {
      const url = processUrl(inputUrl);
      showStatus("Saving...");
      
      // Save directly to Chrome storage
      chrome.storage.local.set({
        homepage: url,
        redirectOnce: redirectOnce,
        sameTab: sameTab
      }, function() {
        if (chrome.runtime.lastError) {
          logError('Popup', "Error saving: " + chrome.runtime.lastError.message);
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
  const urlInput = document.getElementById('url');
  urlInput.addEventListener('input', function() {
    const val = urlInput.value.trim();
    const httpCheckbox = document.getElementById('use-http');
    
    // Auto-check HTTP for local addresses
    if (httpCheckbox && isLocalAddress(val)) {
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

// Function to initialize the popup
function initPopup() {
  // Get all settings from storage
  chrome.storage.local.get(['homepage', 'redirectOnce', 'sameTab'], function(data) {
    if (chrome.runtime.lastError) {
      logError('Popup', "Error getting settings: " + chrome.runtime.lastError.message);
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
    
    // Set same-tab checkbox
    document.getElementById('same-tab').checked = !!data.sameTab;
  });
} 