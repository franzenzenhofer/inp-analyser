import { describe, expect, it } from 'vitest';
import { decideRequest, isFirstParty, siteKey, type DecisionContext } from './fetch-decision.js';

const CONTEXT: DecisionContext = { pageUrl: 'https://www.shop.example/p/1', mainFrameId: 'MAIN', allowMutations: null };
const req = (method: string, url: string, resourceType = 'XHR', frameId = 'MAIN') => ({ method, url, resourceType, frameId });

describe('siteKey / isFirstParty', () => {
  it('groups subdomains of the last two labels, keeps IPs whole', () => {
    expect(siteKey('api.shop.example')).toBe('shop.example');
    expect(siteKey('127.0.0.1')).toBe('127.0.0.1');
    expect(isFirstParty('https://api.shop.example/x', CONTEXT.pageUrl)).toBe(true);
    expect(isFirstParty('https://www.google-analytics.com/g/collect', CONTEXT.pageUrl)).toBe(false);
    expect(isFirstParty('http://cdn.thirdparty.test:8080/x', 'http://site.inp.test:8080/')).toBe(false);
  });
});

describe('decideRequest (armed)', () => {
  it('cancels every main-frame document navigation, GET or POST', () => {
    expect(decideRequest(req('GET', 'https://www.shop.example/other', 'Document'), CONTEXT)).toStrictEqual({ action: 'cancel-navigation' });
    expect(decideRequest(req('POST', 'https://www.shop.example/api/subscribe', 'Document'), CONTEXT)).toStrictEqual({ action: 'cancel-navigation' });
  });

  it('lets iframe document loads through', () => {
    expect(decideRequest(req('GET', 'https://ads.example/frame', 'Document', 'CHILD'), CONTEXT).action).toBe('continue');
  });

  it('blocks first-party mutations, allows safe methods and third-party beacons', () => {
    expect(decideRequest(req('POST', 'https://api.shop.example/delete', 'Fetch'), CONTEXT)).toStrictEqual({ action: 'block', reason: 'first-party POST Fetch' });
    expect(decideRequest(req('DELETE', 'https://www.shop.example/cart/1'), CONTEXT).action).toBe('block');
    expect(decideRequest(req('post', 'https://www.shop.example/rum', 'Ping'), CONTEXT).action).toBe('block');
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(decideRequest(req(method, 'https://www.shop.example/api'), CONTEXT).action).toBe('continue');
    expect(decideRequest(req('POST', 'https://www.google-analytics.com/g/collect', 'Ping'), CONTEXT).action).toBe('continue');
  });

  it('--allow-mutations exempts matching URLs from blocking only', () => {
    const context = { ...CONTEXT, allowMutations: /\/api\/search$/ };
    expect(decideRequest(req('POST', 'https://www.shop.example/api/search'), context).action).toBe('continue');
    expect(decideRequest(req('POST', 'https://www.shop.example/api/delete'), context).action).toBe('block');
    expect(decideRequest(req('POST', 'https://www.shop.example/api/search', 'Document'), context).action).toBe('cancel-navigation');
  });
});
