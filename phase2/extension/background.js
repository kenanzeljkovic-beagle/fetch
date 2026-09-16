// Fetch Dialer for Twenty — background service worker.
// Content scripts for a self-hosted Twenty domain are registered from the
// options page (needs a user gesture for the permission prompt) and persist
// across browser sessions, so there is nothing to re-register here.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
