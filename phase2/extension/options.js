const DEFAULTS = { twentyUrl: '', appUrl: 'https://app.fetchdialer.com', repEmail: '', theme: 'auto' };
const SCRIPT_ID = 'fetch-twenty-custom';
const $ = (id) => document.getElementById(id);

function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = cls;
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

async function registerFor(origin) {
  const pattern = origin + '/*';
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error('Permission for ' + origin + ' was not granted.');
  try { await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }); } catch { /* not registered yet */ }
  await chrome.scripting.registerContentScripts([{
    id: SCRIPT_ID,
    matches: [pattern],
    js: ['dock.css.js', 'content.js'],
    css: ['content.css'],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }]);
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $('twentyUrl').value = s.twentyUrl || '';
  $('appUrl').value = s.appUrl || DEFAULTS.appUrl;
  $('repEmail').value = s.repEmail || '';
  $('theme').value = s.theme || 'auto';
}

async function save() {
  const twentyUrl = $('twentyUrl').value.trim();
  const appUrl = $('appUrl').value.trim() || DEFAULTS.appUrl;
  const repEmail = $('repEmail').value.trim().toLowerCase();
  const theme = $('theme').value;

  if (!originOf(appUrl)) return setStatus('Fetch app URL must be a full URL, e.g. https://app.fetchdialer.com', 'err');
  if (twentyUrl && !originOf(twentyUrl)) return setStatus('Twenty URL must be a full URL, e.g. https://crm.yourcompany.com', 'err');

  setStatus('Saving…');
  try {
    if (twentyUrl) await registerFor(originOf(twentyUrl));
    await chrome.storage.sync.set({ twentyUrl: twentyUrl ? originOf(twentyUrl) : '', appUrl: originOf(appUrl), repEmail, theme });
    setStatus('Saved. Reload your Twenty tab to see Fetch.', 'ok');
  } catch (e) {
    setStatus(e.message || String(e), 'err');
  }
}

$('save').addEventListener('click', save);
load();
