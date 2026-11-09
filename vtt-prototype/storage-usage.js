(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('mode') === 'player') return;
  const $ = id => document.getElementById(id);
  const DB_SCENES = { name: 'woa-vtt-scenes-db', store: 'collections', key: 'main' };
  const DB_MAPS = { name: 'woa-vtt-local-assets', store: 'scene-media' };
  const DB_LIBRARY = { name: 'woa-vtt-asset-library', store: 'items' };
  const formatBytes = value => {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return bytes.toLocaleString() + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = bytes / 1024, index = 0;
    while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; }
    return size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2) + ' ' + units[index];
  };
  const jsonBytes = value => {
    try { return new Blob([JSON.stringify(value)]).size; } catch { return 0; }
  };
  async function openDatabase(name) {
    if (!('indexedDB' in window)) throw new Error('IndexedDB is unavailable');
    if (typeof indexedDB.databases === 'function') {
      const known = await indexedDB.databases();
      if (Array.isArray(known) && !known.some(item => item.name === name)) return null;
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not inspect local database'));
      request.onblocked = () => reject(new Error('Database inspection was blocked'));
    });
  }
  async function readStore(database, storeName, key) {
    const db = await openDatabase(database);
    if (!db) return null;
    try {
      return await new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(storeName)) { resolve(null); return; }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = key === undefined ? store.getAll() : store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error || new Error('Could not read local storage data'));
      });
    } finally { db.close(); }
  }
  function localStorageBytes() {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        const value = localStorage.getItem(key) || '';
        bytes += new Blob([key, value]).size;
      }
    } catch {}
    return bytes;
  }
  async function refresh() {
    const status = $('storage-usage-status');
    const button = $('storage-usage-refresh');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Calculating local storage usage…';
    try {
      const sceneInfo = window.woaGetSceneUsage?.() || null;
      const sceneCollection = await readStore(DB_SCENES.name, DB_SCENES.store, DB_SCENES.key).catch(() => null);
      const sceneBytes = sceneCollection ? jsonBytes(sceneCollection) : Number(sceneInfo?.collectionBytes) || 0;
      const mapData = await readStore(DB_MAPS.name, DB_MAPS.store).catch(() => null);
      const mapBytes = jsonBytes(mapData);
      const libraryItems = await readStore(DB_LIBRARY.name, DB_LIBRARY.store).catch(() => null);
      const libraryBytes = Array.isArray(libraryItems) ? jsonBytes(libraryItems) : 0;
      const settingsBytes = localStorageBytes();
      const vttTotal = sceneBytes + mapBytes + libraryBytes + settingsBytes;
      const sceneCount = Number(sceneInfo?.sceneCount) || sceneCollection?.scenes?.length || 0;
      $('storage-scene-count').textContent = sceneInfo?.ready === false ? 'Loading…' : String(sceneCount);
      $('storage-active-scene').textContent = sceneInfo?.activeSceneName || 'Scene collection';
      $('storage-vtt-total').textContent = formatBytes(vttTotal);
      $('storage-scenes-bytes').textContent = formatBytes(sceneBytes);
      $('storage-maps-bytes').textContent = formatBytes(mapBytes);
      $('storage-library-bytes').textContent = formatBytes(libraryBytes);
      $('storage-local-bytes').textContent = formatBytes(settingsBytes);
      let estimate = null;
      if (navigator.storage?.estimate) {
        try { estimate = await navigator.storage.estimate(); } catch {}
      }
      const used = Number(estimate?.usage) || 0;
      const quota = Number(estimate?.quota) || 0;
      const percent = quota > 0 ? Math.min(100, used / quota * 100) : 0;
      $('storage-origin-summary').textContent = quota ? formatBytes(used) + ' / ' + formatBytes(quota) : 'Not available';
      $('storage-origin-fill').style.width = percent.toFixed(2) + '%';
      $('storage-origin-meter').setAttribute('aria-valuenow', String(Math.round(percent)));
      $('storage-origin-meter').setAttribute('aria-valuetext', quota ? formatBytes(used) + ' used of ' + formatBytes(quota) : 'Browser estimate unavailable');
      $('storage-origin-meter').dataset.warning = String(percent >= 80);
      $('storage-origin-detail').textContent = quota
        ? formatBytes(Math.max(0, quota - used)) + ' estimated browser quota remaining · ' + percent.toFixed(1) + '% used. This estimate covers the entire website origin, not just the VTT.'
        : 'Your browser does not provide a storage quota estimate. The VTT data breakdown above is an estimate from its saved records.';
      if (status) status.textContent = sceneInfo?.ready === false
        ? 'Waiting for the scene collection to finish loading. Refresh after it is ready.'
        : 'Updated just now. Scene count has no fixed application limit; practical capacity depends on browser storage.';
    } catch (error) {
      if (status) status.textContent = 'Could not calculate storage usage: ' + (error.message || 'storage unavailable');
    } finally {
      if (button) button.disabled = false;
    }
  }
  $('storage-usage-refresh')?.addEventListener('click', refresh);
  window.addEventListener('woa-scene-collection-updated', refresh);
  refresh();
})();