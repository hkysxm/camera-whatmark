// Installation is independent of the photo editor and its in-memory queue.
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || !/^https?:$/.test(location.protocol)) return;
  const register = () => {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .catch(error => console.warn('OptiMark offline setup unavailable:', error));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
