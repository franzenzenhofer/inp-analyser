/* Test Tracker Inc. post-consent kickoff: back-to-back 400 ms tasks for 3 s after consent. */
(function startKickoff() {
  const TASK_MS = 400;
  const WINDOW_MS = 3000;
  const started = performance.now();
  window.kickoffTasks = [];
  function adTechKickoffTask() {
    const begin = performance.now();
    while (performance.now() < begin + TASK_MS) { /* auction, sync, segment */ }
    window.kickoffTasks.push([begin, performance.now()]);
    if (performance.now() - started < WINDOW_MS) setTimeout(adTechKickoffTask, 0);
  }
  setTimeout(adTechKickoffTask, 0);
  document.documentElement.dataset.kickoff = 'running';
  (window.thirdPartyLoaded ||= []).push('kickoff');
})();
