import { describe, expect, it } from 'vitest';
import { botWallMarkers } from './bot-wall.js';

const NORMAL = { status: 200, title: 'Wohnungen mieten', html: '<html><head><script src="https://js.datadome.co/tags.js"></script></head><body>ok</body></html>' };

describe('botWallMarkers', () => {
  it('a normal page (even with the DataDome tag embedded) has no marker', () => {
    expect(botWallMarkers(NORMAL)).toStrictEqual([]);
    expect(botWallMarkers({ ...NORMAL, status: null })).toStrictEqual([]);
  });

  it('blocking statuses are walls', () => {
    for (const status of [403, 429, 503]) expect(botWallMarkers({ ...NORMAL, status })).toStrictEqual([`HTTP ${status}`]);
  });

  it('Cloudflare, Akamai, DataDome and PerimeterX challenge pages are recognised on a 200 too', () => {
    expect(botWallMarkers({ ...NORMAL, title: 'Just a moment...', html: '<div id="challenge-running"></div><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=1&cf-chl=x"></script>' }))
      .toStrictEqual(['Cloudflare challenge title', 'Cloudflare #challenge-running', 'Cloudflare cf-chl challenge']);
    expect(botWallMarkers({ ...NORMAL, html: '<div id="sec-if-cpt-container"></div>' })).toStrictEqual(['Akamai sec-cpt challenge']);
    expect(botWallMarkers({ ...NORMAL, html: '<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=x"></iframe>' })).toStrictEqual(['DataDome captcha']);
    expect(botWallMarkers({ ...NORMAL, html: '<div id="px-captcha"></div>' })).toStrictEqual(['PerimeterX px-captcha']);
    expect(botWallMarkers({ ...NORMAL, title: 'Access Denied' })).toStrictEqual(['Akamai block title']);
  });
});
