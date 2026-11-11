/** Third-party origin derived from the current location (never a hard-coded port). */
export function thirdPartyUrl(path) {
  return `${location.protocol}//cdn.thirdparty.test:${location.port}${path}`;
}

/** Loads a classic script from the third-party origin. Resolves false when the request was blocked. */
export function loadThirdPartyScript(path) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = thirdPartyUrl(path);
    script.addEventListener('load', () => resolve(true));
    script.addEventListener('error', () => resolve(false));
    document.head.append(script);
  });
}
