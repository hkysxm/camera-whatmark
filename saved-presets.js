// Named presets live separately from the automatically saved photo queue.
(() => {
  let database;
  const open = () => {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open(`optimark-presets:${new URL('./', location.href).pathname}`, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('presets', { keyPath: 'name' });
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('请关闭其他旧版页面后重试')); };
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); database = null; };
        resolve(request.result);
      };
    }).catch(error => { database = null; throw error; });
    return database;
  };
  async function access(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('presets', mode);
      const request = action(tx.objectStore('presets'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('预设存储不可用'));
    });
  }
  window.addEventListener('load', () => {
    const nameInput = document.getElementById('saved-preset-name');
    const select = document.getElementById('saved-preset-select');
    const save = document.getElementById('btn-save-preset');
    const apply = document.getElementById('btn-apply-preset');
    const note = document.getElementById('saved-preset-status');
    if (!save) return;
    const fail = error => {
      const message = error.name === 'QuotaExceededError' ? '本地空间不足，预设未保存' : `预设操作失败：${error.message}`;
      note.textContent = message; showToast(message, 'error');
    };
    async function refresh(selected = select.value) {
      const names = await access('readonly', store => store.getAllKeys());
      select.replaceChildren(new Option('选择已保存的预设', ''));
      for (const name of names) select.add(new Option(name, name));
      select.value = names.includes(selected) ? selected : '';
      apply.disabled = !select.value;
    }
    select.addEventListener('change', () => { nameInput.value = select.value; apply.disabled = !select.value; });
    save.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); showToast('请先填写预设名称', 'info'); return; }
      save.disabled = true;
      try {
        const item = state.queue[state.activeIndex];
        const texts = Object.fromEntries(Object.entries(item?.exif || {}).filter(([key]) =>
          /^Custom\d+$/.test(key) || key === 'Copyright' || key === 'Artist'));
        const keys = new Set([...state.lines.flatMap(line => line.keys), ...Object.keys(texts)]);
        const preset = JSON.parse(JSON.stringify({ name, schema: 1, config: state.config, lines: state.lines,
          catalog: state.catalog.filter(field => keys.has(field.key)).map(field => ({ ...field, defaultVal: '' })),
          texts, logo: state.customLogoImg ? imageDataUrl(state.customLogoImg) : null }));
        await access('readwrite', store => store.put(preset));
        await refresh(name);
        note.textContent = `已保存「${name}」到当前浏览器`;
        showToast('预设已保存，同名保存会更新原预设', 'success');
      } catch (error) { fail(error); }
      finally { save.disabled = false; }
    });
    apply.addEventListener('click', async () => {
      if (!select.value || state.exportBusy) return;
      const previousInert = document.body.inert;
      document.body.inert = true;
      try {
        const preset = await access('readonly', store => store.get(select.value));
        if (!preset || preset.schema !== 1 || !preset.config || !Array.isArray(preset.lines)) throw new Error('无法读取该预设');
        // Decode first, so a broken logo cannot leave a partially applied preset.
        const logo = preset.logo ? await loadImage(preset.logo) : null;
        Object.assign(state.config, preset.config);
        state.lines = preset.lines;
        state.customLogoImg = logo;
        for (const field of preset.catalog) if (!state.catalog.some(existing => existing.key === field.key)) state.catalog.push(field);
        const item = state.queue[state.activeIndex];
        if (item) {
          Object.assign(item.exif, preset.texts);
          Object.assign(item.edits ||= {}, preset.texts);
        }
        syncUiControlsFromConfig();
        document.getElementById('select-export-scale').value = state.config.exportScale;
        document.getElementById('select-line-sep').value = state.config.lineSeparator;
        document.getElementById('chk-show-tag-label').checked = state.config.showTagLabel;
        document.querySelector(`.fmt-btn[data-fmt="${state.config.exportFormat}"]`)?.click();
        renderLinesComposer(); renderExifPool(); renderExifInspectorView(); renderWatermarkCanvas();
        note.textContent = `已应用「${preset.name}」`;
        showToast('已应用保存的预设', 'success');
      } catch (error) { fail(error); }
      finally { document.body.inert = previousInert; }
    });
    refresh().catch(fail);
  });
})();
