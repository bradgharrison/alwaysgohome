/**
 * AlwaysGoHome Extension - Shared Utilities
 * Version: 3.0.0
 * Last updated: 2024-03-19
 */

// Shared constants
const LOCAL_ADDRESS_PATTERN = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/;
const HOMEPAGE_MARKER = 'alwaysGoHomeSameTab';

// Shared logging functions
function logError(source, message) {
  console.error(`[AlwaysGoHome ${source}]`, message);
}

function logDebug(source, message) {
  console.log(`[AlwaysGoHome ${source}]`, message);
}

// Format a URL with appropriate protocol and special marker
function formatHomepageUrl(url) {
  if (!url) return null;
  
  // Make sure it has a protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (LOCAL_ADDRESS_PATTERN.test(url)) {
      url = 'http://' + url;
    } else {
      url = 'https://' + url;
    }
  }
  
  // Add our special marker
  if (url.indexOf('#') === -1) {
    url += '#' + HOMEPAGE_MARKER;
  } else {
    url += '&' + HOMEPAGE_MARKER;
  }
  
  return url;
}

// Check if a URL is a local/internal address
function isLocalAddress(url) {
  return LOCAL_ADDRESS_PATTERN.test(url);
}

// Check if a URL has our homepage marker
function hasHomepageMarker(url) {
  return url && url.includes(HOMEPAGE_MARKER);
} 