// Photo persistence is separate from rendering and from the service worker's asset cache.
const queueStorage = (() => {
  const DB_NAME = `optimark-queue:${new URL('./', location.href).pathname}`;
  let db, ready = false, suspended = false, revision = 0, savedSignature = '';
  let timer, saving, lastError = '';
  const knownImages = new Map();
  const encodedImages = new WeakMap();
  const logoKeys = new WeakMap();

  function status(message, retry = false) {
    const label = document.getElementById('queue-storage-status');
    if (label) label.textContent = message;
    const button = document.getElementById('btn-retry-queue-save');
    if (button) button.hidden = !retry;
  }

  function capture() {
    const images = new Map();
    const queue = state.queue.map(({ image, ...item }) => {
      const imageKey = `photo:${item.id}`;
      images.set(imageKey, image);
      return { ...item, imageKey };
    });
    let logoKey = null;
    if (state.customLogoImg) {
      if (!logoKeys.has(state.customLogoImg)) logoKeys.set(state.customLogoImg, `logo:${crypto.randomUUID()}`);
      logoKey = logoKeys.get(state.customLogoImg);
      images.set(logoKey, state.customLogoImg);
    }
    const signature = JSON.stringify({ schema: 1, queue, activeIndex: state.activeIndex,
      config: state.config, lines: state.lines, catalog: state.catalog, logoKey });
    return { data: JSON.parse(signature), signature, images };
  }

  function imageBlob(image) {
    if (!encodedImages.has(image)) {
      const promise = new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        if (!canvas.width || !canvas.height) return reject(new Error('照片像素不可用'));
        canvas.getContext('2d').drawImage(image, 0, 0);
        canvas.toBlob(blob => {
          canvas.width = canvas.height = 1;
          if (blob) resolve(blob); else reject(new Error('无法保存照片像素'));
        }, 'image/png');
      });
      encodedImages.set(image, promise);
      promise.catch(() => encodedImages.delete(image));
    }
    return encodedImages.get(image);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      let rejected = false;
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('session');
        request.result.createObjectStore('images', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { rejected = true; reject(new Error('请关闭其他旧版页面后重试')); };
      request.onsuccess = () => {
        if (rejected) request.result.close(); else resolve(request.result);
      };
    });
  }

  function read(store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('读取本地队列失败'));
    });
  }

  async function initialize() {
    document.getElementById('btn-retry-queue-save')?.addEventListener('click', () => flush());
    if (!/^https?:$/.test(location.protocol) || !('indexedDB' in window)) {
      status('当前打开方式不支持本地自动保存，请通过网站访问');
      return false;
    }
    try {
      db = await openDatabase();
      db.onversionchange = () => { db.close(); suspended = true; status('本地存储已更新，请先导出当前照片再重新打开'); };
      const data = await read('session', 'current');
      if (data) {
        if (data.schema !== 1 || !Array.isArray(data.queue) || !Array.isArray(data.lines) ||
            !Array.isArray(data.catalog) || !data.config || !Number.isInteger(data.revision)) {
          throw new Error('本地队列格式无法读取');
        }
        const restored = [];
        const restoreImage = async key => {
          const record = await read('images', key);
          if (!(record?.blob instanceof Blob)) throw new Error('本地照片缺失');
          const image = await loadImageBlob(record.blob);
          knownImages.set(key, { image, size: record.blob.size });
          return image;
        };
        for (const { imageKey, ...item } of data.queue) {
          restored.push({ ...item, image: await restoreImage(imageKey) });
        }
        const logo = data.logoKey ? await restoreImage(data.logoKey) : null;
        if (logo) logoKeys.set(logo, data.logoKey);
        state.queue = restored;
        state.activeIndex = restored.length ? Math.max(0, Math.min(data.activeIndex, restored.length - 1)) : -1;
        Object.assign(state.config, data.config);
        state.lines = data.lines; state.catalog = data.catalog; state.customLogoImg = logo;
        revision = data.revision;
        savedSignature = capture().signature;
        status(`已恢复 ${restored.length} 张 · 本地 ${(data.bytes / 1048576).toFixed(1)} MB`);
      }
      ready = true;
      document.getElementById('file-upload-input')?.addEventListener('change', () => {
        // This requests protection from automatic eviction, not unlimited storage.
        navigator.storage?.persist?.().catch(() => {});
      }, { once: true });
      return !!data;
    } catch (error) {
      // Never overwrite an existing snapshot when restoration fails.
      suspended = true;
      status(`无法恢复本地队列，自动保存已暂停：${error.message}`);
      return false;
    }
  }

  function commit(data, additions, keys) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['session', 'images'], 'readwrite');
      let conflict = false, writeError;
      const sessions = tx.objectStore('session'), images = tx.objectStore('images');
      const current = sessions.get('current');
      current.onsuccess = () => {
        // Atomic revision check prevents a stale tab from replacing another tab's work.
        if ((current.result?.revision || 0) !== revision) { conflict = true; tx.abort(); return; }
        try {
          for (const key of knownImages.keys()) if (!keys.has(key)) images.delete(key);
          for (const record of additions) images.put(record);
          sessions.put({ ...data, revision: revision + 1, savedAt: Date.now() }, 'current');
        } catch (error) { writeError = error; tx.abort(); }
      };
      tx.oncomplete = () => { revision++; resolve(); };
      tx.onabort = () => {
        const error = conflict ? new Error('其他窗口已更新本地队列，请先导出当前修改再重新打开') : writeError || tx.error || new Error('本地保存失败');
        if (conflict) { error.name = 'QueueConflictError'; suspended = true; }
        reject(error);
      };
    });
  }

  async function saveLatest() {
    try {
      for (;;) {
        const snapshot = capture();
        if (snapshot.signature === savedSignature) return true;
        status('正在保存到本机…');
        const additions = [], nextKnown = new Map();
        let bytes = 0;
        for (const [key, image] of snapshot.images) {
          let record = knownImages.get(key);
          if (!record || record.image !== image) {
            const blob = await imageBlob(image);
            additions.push({ key, blob }); record = { image, size: blob.size };
          }
          bytes += record.size; nextKnown.set(key, record);
        }
        snapshot.data.bytes = bytes;
        await commit(snapshot.data, additions, snapshot.images);
        knownImages.clear();
        for (const [key, record] of nextKnown) knownImages.set(key, record);
        // Let IndexedDB own the blobs after commit instead of retaining another in-memory copy.
        for (const image of snapshot.images.values()) encodedImages.delete(image);
        savedSignature = snapshot.signature; lastError = '';
        if (capture().signature === savedSignature) {
          status(`已保存到本机 · ${snapshot.data.queue.length} 张 · ${(bytes / 1048576).toFixed(1)} MB`);
          return true;
        }
        // Edits/deletes made during encoding are saved in order, never overwritten by an older save.
      }
    } catch (error) {
      const message = error.name === 'QuotaExceededError'
        ? '本地空间不足，最新修改未保存；请删除部分照片后重试'
        : `最新修改未保存：${error.message}`;
      status(message, !suspended);
      if (lastError !== message) { showToast(message, 'error'); lastError = message; }
      return false;
    }
  }

  function flush() {
    clearTimeout(timer);
    if (!ready || !db || suspended) return Promise.resolve(false);
    if (!saving) saving = saveLatest().finally(() => { saving = null; });
    return saving;
  }

  function schedule() {
    if (!ready || !db || suspended || capture().signature === savedSignature) return;
    status('有修改待保存…');
    clearTimeout(timer); timer = setTimeout(flush, 150);
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', () => flush());
  window.addEventListener('beforeunload', event => {
    if (ready && db && capture().signature !== savedSignature) {
      flush(); event.preventDefault(); event.returnValue = '';
    }
  });
  return { initialize, schedule, flush };
})();
