/* Test Tracker Inc. RUM agent: wraps EventTarget.prototype.addEventListener like Sentry or New Relic do.
   Every listener registered afterwards runs inside rumWrappedListener, so naive attribution blames this file. */
(function installRumWrapper() {
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const wrappers = new WeakMap();
  window.rumTimings = [];
  EventTarget.prototype.addEventListener = function rumAddEventListener(type, listener, options) {
    if (typeof listener !== 'function') return originalAdd.call(this, type, listener, options);
    const wrapped = wrappers.get(listener) || function rumWrappedListener(event) {
      const begin = performance.now();
      try {
        return listener.call(this, event);
      } finally {
        window.rumTimings.push({ type: event.type, ms: performance.now() - begin });
      }
    };
    wrappers.set(listener, wrapped);
    return originalAdd.call(this, type, wrapped, options);
  };
  EventTarget.prototype.removeEventListener = function rumRemoveEventListener(type, listener, options) {
    return originalRemove.call(this, type, wrappers.get(listener) || listener, options);
  };
  (window.thirdPartyLoaded ||= []).push('rum-wrapper');
})();
