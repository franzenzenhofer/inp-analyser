/* Test Tracker Inc. tag manager: document-level listeners that run on every click on the page. */
(function installTagManager() {
  const CLICK_COST_MS = 150;
  function tagManagerSpin(ms) {
    const end = performance.now() + ms;
    while (performance.now() < end) { /* collect click context */ }
  }
  let lastPointer = 0;
  document.addEventListener('pointerdown', function tagManagerPointerdown(event) {
    lastPointer = event.timeStamp;
  }, true);
  document.addEventListener('click', function tagManagerClickListener(event) {
    tagManagerSpin(CLICK_COST_MS);
    window.tagManagerEvents = (window.tagManagerEvents || 0) + (event.timeStamp >= lastPointer ? 1 : 0);
  });
  (window.thirdPartyLoaded ||= []).push('tag-manager');
})();
