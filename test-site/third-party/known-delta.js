/* Test Tracker Inc. click tracker that adds exactly 200 ms to every click (the A/B ground truth). */
(function installKnownDelta() {
  const DELTA_MS = 200;
  document.addEventListener('click', function knownDeltaListener() {
    const end = performance.now() + DELTA_MS;
    while (performance.now() < end) { /* known cost */ }
  });
  (window.thirdPartyLoaded ||= []).push('known-delta');
})();
