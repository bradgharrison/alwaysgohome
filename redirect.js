/**
 * AlwaysGoHome Extension - Redirect Script
 * Version: 1.2
 * Last updated: 2025-03-12
 */

// Constants
const LOCAL_ADDRESS_PATTERN = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/;

// Function to log only critical errors
function logError(message) {
  console.error("[AlwaysGoHome Redirect]", message);
}

// Check if we should redirect based on user settings
function checkShouldRedirect(callback) {
  // Ask the background script if we should redirect
  chrome.runtime.sendMessage({ action: 'checkRedirectStatus' }, function(response) {
    if (chrome.runtime.lastError) {
      logError("Error checking redirect status: " + chrome.runtime.lastError.message);
      // Default to redirect if there's an error
      callback(true);
      return;
    }
    
    callback(response && response.shouldRedirect);
  });
}

// Main redirect function
function attemptRedirect() {
  // First check if we should redirect
  checkShouldRedirect(function(shouldRedirect) {
    if (!shouldRedirect) {
      // Instead of showing a message, we'll use an empty page that resembles
      // the default browser behavior
      useDefaultBrowserBehavior();
      return;
    }
    
    // Mark that we've redirected in this session
    chrome.runtime.sendMessage({ action: 'markRedirected' });
    
    // Proceed with redirect
    chrome.storage.local.get('homepage', function(data) {
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
  });
}

// Function to use default browser behavior
function useDefaultBrowserBehavior() {
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
  // Attempt redirect
  attemptRedirect();
});

// Also attempt redirect on window load in case DOMContentLoaded was missed
window.addEventListener('load', function() {
  // Check if we're still on the redirect page after 500ms
  // This helps in case DOMContentLoaded handler failed
  setTimeout(function() {
    if (window.location.href.includes('redirect.html')) {
      attemptRedirect();
    }
  }, 500);
}); 