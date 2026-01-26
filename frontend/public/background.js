// Background service worker for Chrome extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Secure P2P Workspace extension installed');
});

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Get screen dimensions
  chrome.system.display.getInfo((displays) => {
    const primaryDisplay = displays[0];
    const screenWidth = primaryDisplay.bounds.width;
    const screenHeight = primaryDisplay.bounds.height;

    // Calculate 1/3 of screen size
    const width = Math.floor(screenWidth / 3);
    const height = screenHeight;

    // Position on the right side of screen
    const left = screenWidth - width;
    const top = 0;

    // Open workspace in a new window
    chrome.windows.create({
      url: chrome.runtime.getURL('index.html'),
      type: 'popup',
      width: width,
      height: height,
      left: left,
      top: top
    });
  });
});