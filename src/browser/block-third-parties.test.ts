import { describe, expect, it } from 'vitest';
import { blockPatterns } from './block-third-parties.js';

const entityMap = { entities: [{ name: 'Test Tracker Inc.', category: 'analytics', domains: ['cdn.thirdparty.test'] }] };
const ctx = {
  pageUrl: 'https://www.example.com/page',
  observedUrls: [
    'https://www.example.com/app.js',
    'https://static.example.com/vendor.js',
    'https://www.googletagmanager.com/gtm.js?id=GTM-X',
    'https://cdn.cookielaw.org/scripttemplates/otSDKStub.js',
    'https://cdn.thirdparty.test/tracker.js',
  ],
  entityMap,
};

describe('blockPatterns', () => {
  it('allow blocks nothing', () => {
    expect(blockPatterns({ kind: 'allow' }, ctx)).toEqual([]);
  });
  it('block-all blocks every third-party host except consent managers (OneTrust/cookielaw)', () => {
    expect(blockPatterns({ kind: 'block-all' }, ctx)).toEqual(['*://cdn.thirdparty.test/*', '*://cdn.thirdparty.test:*/*', '*://www.googletagmanager.com/*', '*://www.googletagmanager.com:*/*']);
  });
  it('block-entity uses the --entity-map domains, then third-party-web', () => {
    expect(blockPatterns({ kind: 'block-entity', entity: 'Test Tracker Inc.' }, ctx)).toEqual(['*://*.cdn.thirdparty.test/*', '*://*.cdn.thirdparty.test:*/*', '*://cdn.thirdparty.test/*', '*://cdn.thirdparty.test:*/*']);
    expect(blockPatterns({ kind: 'block-entity', entity: 'Google Tag Manager' }, ctx)).toContain('*://*.googletagmanager.com/*');
  });
  it('blocks a bare hostname entity (hosts third-party-web does not know)', () => {
    expect(blockPatterns({ kind: 'block-entity', entity: 'widgets.example.net' }, ctx)).toEqual(['*://*.widgets.example.net/*', '*://*.widgets.example.net:*/*', '*://widgets.example.net/*', '*://widgets.example.net:*/*']);
  });
  it('fails loud for an unknown entity', () => {
    expect(() => blockPatterns({ kind: 'block-entity', entity: 'Nobody Inc.' }, ctx)).toThrow(/unknown entity/);
  });
});
