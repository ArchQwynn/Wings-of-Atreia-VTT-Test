(() => {
  'use strict';

  if (new URLSearchParams(location.search).get('mode') === 'player') return;

  const DB_NAME = 'woa-vtt-asset-library';
  const DB_VERSION = 1;
  const STORE_NAME = 'items';
  const FORMAT = 'wings-of-atreia-vtt-asset-library-item';
  const STORAGE_LIMIT_BYTES = 5_000_000_000;
  const API_URL_KEY = 'woa-vtt-asset-library-api-url';
  const TOKEN_KEY = 'woa-vtt-asset-library-gm-token';
  const $ = id => document.getElementById(id);
  const host = $('asset-library-list');
  const count = $('asset-library-count');
  const status = $('asset-library-status');
  const storageText = $('asset-library-storage-text');
  const storageFill = $('asset-library-storage-fill');
  const storageMeter = $('asset-library-storage-meter');
  const search = $('asset-library-search');
  const filter = $('asset-library-filter');
  const saveButton = $('asset-library-save-selected');
  const apiUrlInput = $('asset-library-api-url');
  const accessKeyInput = $('asset-library-access-key');
  const connectButton = $('asset-library-connect');
  const logoutButton = $('asset-library-logout');
  const refreshButton = $('asset-library-refresh');
  const importButton = $('asset-library-import-local');
  let dbPromise = null;
  let items = [];
  let apiBase = localStorage.getItem(API_URL_KEY) || '';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let usedBytes = 0;
  const previewCache = new Map();

  const clone = value => JSON.parse(JSON.stringify(value));
  const makeId = () => 'library-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable in this browser.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('kind', 'kind', { unique: false });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('Could not open the local Asset Library backup.'));
      request.onblocked = () => reject(new Error('Local Asset Library upgrade is blocked by another open tab. Close other VTT tabs and reload.'));
    });
    return dbPromise;
  }

  async function readLocalAll() {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('Could not read the local Asset Library backup.'));
    });
  }

  async function writeLocalItem(item) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(item);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not update the local Asset Library backup.'));
      transaction.onabort = () => reject(transaction.error || new Error('The local backup save was cancelled.'));
    });
  }

  async function removeLocalItem(id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not update the local Asset Library backup.'));
    });
  }

  function selectedObject() {
    const asset = state.assets.find(item => item.id === state.selectedAsset);
    if (asset) return { kind: 'asset', object: asset };
    const tokenObject = state.tokens.find(item => item.id === state.selected);
    if (tokenObject) return { kind: 'token', object: tokenObject };
    return null;
  }

  function makeTemplate(kind, object) {
    const payload = clone(object);
    delete payload.id;
    delete payload.x;
    delete payload.y;
    delete payload.z;
    delete payload._screen;
    delete payload._dragX;
    delete payload._dragY;
    payload.locked = false;
    payload.hidden = false;
    return payload;
  }

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'normal';
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return Math.round(bytes) + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1000;
    let unit = units[0];
    for (let i = 1; i < units.length && value >= 1024; i++) {
      value /= 1000;
      unit = units[i];
    }
    return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + ' ' + unit;
  }

  function updateStorageMeter() {
    if (!storageText || !storageFill || !storageMeter) return;
    const percent = Math.min(100, (usedBytes / STORAGE_LIMIT_BYTES) * 100);
    storageText.textContent = formatBytes(usedBytes) + ' used of 5 GB · ' + formatBytes(Math.max(0, STORAGE_LIMIT_BYTES - usedBytes)) + ' available';
    storageFill.style.width = percent.toFixed(2) + '%';
    storageMeter.setAttribute('aria-valuenow', String(Math.round(percent)));
    storageMeter.setAttribute('aria-valuetext', formatBytes(usedBytes) + ' used out of 5 GB');
  }

  function normalizedApiBase(value) {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('Enter the HTTPS workers.dev URL for your Cloudflare Asset Library Worker.');
    }
    return parsed.origin;
  }

  async function apiRequest(path, options = {}, useToken = true) {
    if (!apiBase) throw new Error('Enter your Cloudflare Worker URL first.');
    const headers = new Headers(options.headers || {});
    if (useToken && token) headers.set('Authorization', 'Bearer ' + token);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let response;
    try {
      response = await fetch(apiBase + '/api' + path, { ...options, headers, cache: 'no-store' });
    } catch {
      throw new Error('Could not reach the Cloud Asset Library. Check the Worker URL and deployment.');
    }
    let body;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { body = await response.json(); } catch { body = {}; }
    } else {
      body = { error: await response.text() };
    }
    if (!response.ok) {
      if (response.status === 401 && useToken) {
        token = '';
        localStorage.removeItem(TOKEN_KEY);
      }
      throw new Error(body?.error || 'Cloud Asset Library request failed (' + response.status + ').');
    }
    return body;
  }

  async function listRemoteItems() {
    return apiRequest('/items');
  }

  async function loadPreview(id, image, placeholder) {
    if (!previewCache.has(id)) {
      previewCache.set(id, apiRequest('/items/' + encodeURIComponent(id) + '/preview')
        .then(result => result.preview || '')
        .catch(() => ''));
    }
    const preview = await previewCache.get(id);
    if (preview && placeholder.isConnected) {
      image.src = preview;
      placeholder.replaceChildren(image);
    }
  }

  function render() {
    if (!host || !count) return;
    const query = (search?.value || '').trim().toLocaleLowerCase();
    const kind = filter?.value || 'all';
    const visible = items
      .filter(item => (kind === 'all' || item.kind === kind) && String(item.name || '').toLocaleLowerCase().includes(query))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    count.textContent = visible.length + ' of ' + items.length + ' saved item' + (items.length === 1 ? '' : 's');
    host.replaceChildren();

    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = items.length ? 'No library items match this search.' : 'Your shared Asset Library is empty. Save a selected token or prop to make it available on your other devices.';
      host.append(empty);
      if (saveButton) saveButton.disabled = !selectedObject() || !token;
      return;
    }

    for (const item of visible) {
      const entry = document.createElement('article');
      entry.className = 'asset-library-entry';

      const thumb = document.createElement('div');
      thumb.className = 'asset-library-thumb';
      const glyph = document.createElement('span');
      glyph.textContent = item.kind === 'token' ? '●' : '◇';
      thumb.append(glyph);
      const previewImage = document.createElement('img');
      previewImage.alt = '';
      previewImage.loading = 'lazy';
      loadPreview(item.id, previewImage, thumb);

      const details = document.createElement('div');
      details.className = 'asset-library-details';
      const name = document.createElement('strong');
      name.textContent = item.name || (item.kind === 'token' ? 'Unnamed Token' : 'Unnamed Asset');
      const meta = document.createElement('small');
      meta.textContent = (item.kind === 'token' ? 'Token template' : 'Prop / asset template') + ' · ' + formatBytes(item.size || 0);
      const actions = document.createElement('div');
      actions.className = 'asset-library-actions';

      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = 'Add to Scene';
      add.disabled = !token;
      add.addEventListener('click', () => addToScene(item.id));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Delete';
      remove.disabled = !token;
      remove.addEventListener('click', () => deleteFromLibrary(item.id));

      actions.append(add, remove);
      details.append(name, meta, actions);
      entry.append(thumb, details);
      host.append(entry);
    }

    if (saveButton) saveButton.disabled = !selectedObject() || !token;
  }

  async function refresh() {
    if (!apiBase || !token) {
      items = [];
      usedBytes = 0;
      render();
      if (storageText) storageText.textContent = 'Connect to the Cloud Asset Library to view shared 5 GB storage.';
      if (storageFill) storageFill.style.width = '0%';
      if (storageMeter) storageMeter.setAttribute('aria-valuenow', '0');
      if (saveButton) saveButton.disabled = true;
      if (logoutButton) logoutButton.hidden = !token;
      if (refreshButton) refreshButton.hidden = true;
      if (connectButton) connectButton.hidden = false;
      try {
        const local = await readLocalAll();
        if (importButton) importButton.hidden = true;
        setStatus(local.length
          ? 'Not connected. ' + local.length + ' item(s) remain in this browser as a local backup and can be imported after connecting.'
          : 'Enter the Cloudflare Worker URL and GM access key to connect.');
      } catch {
        setStatus('Enter the Cloudflare Worker URL and GM access key to connect.');
      }
      return;
    }

    try {
      const result = await listRemoteItems();
      items = Array.isArray(result.items) ? result.items : [];
      usedBytes = Number(result.usedBytes) || 0;
      updateStorageMeter();
      render();
      if (connectButton) connectButton.hidden = true;
      if (logoutButton) logoutButton.hidden = false;
      if (refreshButton) refreshButton.hidden = false;
      const local = await readLocalAll().catch(() => []);
      if (importButton) importButton.hidden = !local.length;
      setStatus('Cloud Asset Library connected. Changes are shared across devices.');
    } catch (error) {
      items = [];
      render();
      if (storageText) storageText.textContent = 'Cloud storage usage is unavailable until the connection is restored.';
      if (connectButton) connectButton.hidden = false;
      if (logoutButton) logoutButton.hidden = !token;
      if (refreshButton) refreshButton.hidden = true;
      setStatus(error.message || 'Could not load the shared Asset Library.', true);
    }
  }

  async function connect() {
    if (!isGM()) return;
    try {
      const nextBase = normalizedApiBase(apiUrlInput?.value);
      const password = accessKeyInput?.value || '';
      if (password.length < 24) throw new Error('The GM access key must be at least 24 characters.');
      if (nextBase !== apiBase) {
        token = '';
        localStorage.removeItem(TOKEN_KEY);
      }
      apiBase = nextBase;
      localStorage.setItem(API_URL_KEY, apiBase);
      setStatus('Connecting to the Cloud Asset Library…');
      const result = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      }, false);
      token = result.token;
      if (!token) throw new Error('The Worker did not return a GM access token.');
      localStorage.setItem(TOKEN_KEY, token);
      if (accessKeyInput) accessKeyInput.value = '';
      await refresh();
    } catch (error) {
      setStatus(error.message || 'Could not connect to the Cloud Asset Library.', true);
    }
  }

  function logout() {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    items = [];
    usedBytes = 0;
    previewCache.clear();
    refresh();
  }

  async function saveSelectedToLibrary() {
    if (!isGM() || !token) return;
    const selected = selectedObject();
    if (!selected) {
      setStatus('Select one token or prop on the battlefield before saving it to the library.', true);
      return;
    }
    try {
      const payload = makeTemplate(selected.kind, selected.object);
      const name = String(selected.object.name || (selected.kind === 'token' ? 'Unnamed Token' : 'Unnamed Asset')).slice(0, 120);
      const now = new Date().toISOString();
      const item = {
        format: FORMAT,
        version: 1,
        id: makeId(),
        kind: selected.kind,
        name,
        createdAt: now,
        updatedAt: now,
        payload
      };
      await apiRequest('/items/' + encodeURIComponent(item.id), {
        method: 'PUT',
        body: JSON.stringify(item)
      });
      await writeLocalItem(item).catch(() => {});
      await refresh();
      setStatus('Saved "' + name + '" to the shared Cloud Asset Library.');
    } catch (error) {
      setStatus(error.message || 'Could not save the selected object.', true);
    }
  }

  async function addToScene(id) {
    if (!isGM() || !token) return;
    try {
      const item = await apiRequest('/items/' + encodeURIComponent(id));
      if (!item || !item.payload || !['token', 'asset'].includes(item.kind)) {
        throw new Error('This shared library item has an invalid format.');
      }
      if (typeof window.beginVttAssetPlacement !== 'function') {
        throw new Error('Placement mode is unavailable. Reload the VTT and try again.');
      }
      if (!window.beginVttAssetPlacement(item.kind, item.payload, item.name)) {
        throw new Error('Could not start placement mode for this library item.');
      }
      setStatus('Placing "' + (item.name || 'library item') + '". Move your cursor over the map and left-click to confirm. Press Esc or right-click to cancel.');
    } catch (error) {
      setStatus(error.message || 'Could not load this shared library item.', true);
    }
  }

  async function deleteFromLibrary(id) {
    if (!isGM() || !token) return;
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    if (!window.confirm('Delete "' + (item.name || 'library item') + '" from the shared Asset Library? Existing scene objects will not be affected.')) return;
    try {
      await apiRequest('/items/' + encodeURIComponent(id), { method: 'DELETE' });
      await removeLocalItem(id).catch(() => {});
      previewCache.delete(id);
      await refresh();
      setStatus('Deleted "' + (item.name || 'library item') + '" from the shared Asset Library. Existing scene objects were not affected.');
    } catch (error) {
      setStatus(error.message || 'Could not delete this shared library item.', true);
    }
  }

  async function importLocalLibrary() {
    if (!isGM() || !token) return;
    let local = [];
    try { local = await readLocalAll(); } catch (error) {
      setStatus(error.message || 'Could not read the local library backup.', true);
      return;
    }
    if (!local.length) {
      if (importButton) importButton.hidden = true;
      return;
    }
    if (items.length && !window.confirm('The shared library already contains items. Importing may replace items with matching IDs. Continue?')) return;
    if (!window.confirm('Import ' + local.length + ' item(s) from this browser into the shared Cloud Asset Library? Your local backup will be kept.')) return;
    try {
      if (importButton) importButton.disabled = true;
      for (const item of local) {
        await apiRequest('/items/' + encodeURIComponent(item.id), {
          method: 'PUT',
          body: JSON.stringify(item)
        });
      }
      await refresh();
      setStatus('Imported ' + local.length + ' local item(s). The local backup was kept on this device.');
    } catch (error) {
      setStatus(error.message || 'The local library import stopped before completion.', true);
    } finally {
      if (importButton) importButton.disabled = false;
    }
  }

  function updateAccess() {
    const section = $('asset-library-panel');
    if (section) section.hidden = playerScreenMode || !isGM();
    if (saveButton) saveButton.disabled = !isGM() || !selectedObject() || !token;
  }

  connectButton?.addEventListener('click', connect);
  logoutButton?.addEventListener('click', logout);
  refreshButton?.addEventListener('click', refresh);
  importButton?.addEventListener('click', importLocalLibrary);
  saveButton?.addEventListener('click', saveSelectedToLibrary);
  search?.addEventListener('input', render);
  filter?.addEventListener('change', render);
  sessionRoleEl?.addEventListener('change', updateAccess);
  apiUrlInput?.addEventListener('change', () => {
    const next = apiUrlInput.value.trim();
    if (next !== apiBase) {
      token = '';
      localStorage.removeItem(TOKEN_KEY);
      try { apiBase = normalizedApiBase(next); localStorage.setItem(API_URL_KEY, apiBase); }
      catch { apiBase = ''; localStorage.removeItem(API_URL_KEY); }
      refresh();
    }
  });

  if (apiUrlInput) apiUrlInput.value = apiBase;
  if (logoutButton) logoutButton.hidden = !token;
  updateAccess();
  refresh();
})();
