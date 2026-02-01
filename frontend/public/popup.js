document.getElementById('openWorkspace').addEventListener('click', () => {
  // Get screen dimensions
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;

  // Calculate 1/3 of screen width
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
    top: top,
    focused: true
  });

  // Close the popup
  window.close();
});