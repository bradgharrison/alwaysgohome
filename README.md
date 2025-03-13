# AlwaysGoHome

A super simple Chrome extension that forces Chrome to open to your homescreen (even on chromeos!) while also redirecting all new tabs to your homepage.

## Features

- Redirects new tab pages to your preferred homepage
- Minimal interface with no browser toolbar icon
- Lightweight with just essential files (under 5KB total)
- Privacy-friendly - requires minimal permissions
- No browsing history access required

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `AlwaysGoHome` folder
5. The extension should now be installed

## Usage

1. Click the extension icon in Chrome's extension menu
2. Enter your preferred homepage URL (e.g., `https://www.google.com`)
3. Click "Save"
4. Now, every new tab will automatically redirect to your homepage

## Privacy

This extension is designed to be minimally invasive:
- Only requires storage permission to save your homepage preference
- Does not access or store browsing history
- No tracking or analytics
- All settings stored locally on your device

## Files

- `manifest.json` - Extension configuration
- `background.js` - Background service worker
- `redirect.html` & `redirect.js` - Handle the redirect functionality
- `popup.html` & `popup.js` - The settings interface

## License

GNU General Public License v3.0 