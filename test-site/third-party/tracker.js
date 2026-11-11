/* Test Tracker Inc. tracker: defines window.thirdPartyTracker, which first-party code calls directly. */
(function installTracker() {
  const TRACK_COST_MS = 120;
  const queue = [];
  window.thirdPartyTracker = {
    track: function trackerTrack(name) {
      const end = performance.now() + TRACK_COST_MS;
      while (performance.now() < end) { /* serialise and enqueue */ }
      queue.push(name);
    },
  };
  (window.thirdPartyLoaded ||= []).push('tracker');
})();
