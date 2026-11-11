import { describe, expect, it } from 'vitest';
import type { SafetyClass } from '../model/scenario.js';
import { classifyTarget, type ClassifiableTarget } from './classify-target.js';

const PAGE = 'https://www.shop.example/produkte/sofa?farbe=grau';

function target(overrides: Partial<ClassifiableTarget>): ClassifiableTarget {
  return { label: '', ariaLabel: '', value: '', title: '', href: null, linkTarget: null, download: false, form: null, ...overrides };
}

const LABEL_TABLE: readonly [string, SafetyClass][] = [
  ['Jetzt kaufen', 'dangerous'],
  ['Kostenpflichtig bestellen', 'dangerous'],
  ['Zahlungspflichtig bestellen', 'dangerous'],
  ['Zur Kasse gehen', 'dangerous'],
  ['In den Warenkorb', 'dangerous'],
  ['Konto löschen', 'dangerous'],
  ['Artikel entfernen', 'dangerous'],
  ['Newsletter abbestellen', 'dangerous'],
  ['Abmelden', 'dangerous'],
  ['Vertrag kündigen', 'dangerous'],
  ['Buy now', 'dangerous'],
  ['Proceed to checkout', 'dangerous'],
  ['Pay with PayPal', 'dangerous'],
  ['Delete account', 'dangerous'],
  ['Log out', 'dangerous'],
  ['Sign out', 'dangerous'],
  ['Unsubscribe', 'dangerous'],
  ['Acheter maintenant', 'dangerous'],
  ['Se déconnecter', 'dangerous'],
  ['Acquista ora', 'dangerous'],
  ['Comprar ahora', 'dangerous'],
  ['Cerrar sesión', 'dangerous'],
  ['Mehr anzeigen', 'safe'],
  ['Show details', 'safe'],
  ['Filter anwenden', 'safe'],
  ['Display options', 'safe'],
  ['Menü öffnen', 'safe'],
  ['Merkzettel', 'safe'],
];

describe('classifyTarget: multilingual denylist on labels', () => {
  it.each(LABEL_TABLE)('%s -> %s', (label, expected) => {
    expect(classifyTarget(target({ label }), PAGE).safety).toBe(expected);
  });

  it('checks aria-label, value and title too', () => {
    expect(classifyTarget(target({ label: 'X', ariaLabel: 'Warenkorb löschen' }), PAGE).reason).toContain('aria-label');
    expect(classifyTarget(target({ value: 'Bestellen' }), PAGE).safety).toBe('dangerous');
    expect(classifyTarget(target({ title: 'Ausloggen' }), PAGE).safety).toBe('dangerous');
  });

  it('checks the href path and query (decoded)', () => {
    expect(classifyTarget(target({ label: 'Weiter', href: 'https://www.shop.example/checkout/step-1' }), PAGE).reason).toBe('denylist term "checkout" in href');
    expect(classifyTarget(target({ label: 'Weiter', href: '/konto?aktion=l%C3%B6schen' }), PAGE).safety).toBe('dangerous');
    expect(classifyTarget(target({ label: 'Ansehen', href: '/display/sofa' }), PAGE).safety).toBe('cross-document-navigation');
  });
});

describe('classifyTarget: forms, schemes, downloads', () => {
  const postSubmit = { method: 'post', hasPassword: false, hasPayment: false, isSubmit: true };

  it('password and payment forms are dangerous', () => {
    expect(classifyTarget(target({ label: 'Weiter', form: { ...postSubmit, hasPassword: true } }), PAGE).reason).toContain('password');
    expect(classifyTarget(target({ label: 'Weiter', form: { ...postSubmit, hasPayment: true } }), PAGE).reason).toContain('payment');
  });

  it('a POST submit is mutating, a GET submit navigates, a non-submit field in a POST form is safe', () => {
    expect(classifyTarget(target({ label: 'Subscribe', form: postSubmit }), PAGE).safety).toBe('mutating');
    expect(classifyTarget(target({ label: 'Search', form: { ...postSubmit, method: 'get' } }), PAGE).safety).toBe('cross-document-navigation');
    expect(classifyTarget(target({ label: 'E-Mail', form: { ...postSubmit, isSubmit: false } }), PAGE).safety).toBe('safe');
  });

  it('mailto, tel, sms and download links are dangerous', () => {
    for (const href of ['mailto:info@shop.example', 'tel:+4312345', 'sms:+4312345']) {
      expect(classifyTarget(target({ label: 'Kontakt', href }), PAGE).safety).toBe('dangerous');
    }
    expect(classifyTarget(target({ label: 'Report', href: '/files/report.csv', download: true }), PAGE).reason).toBe('download attribute');
  });
});

function link(href: string, linkTarget: string | null = null): SafetyClass {
  return classifyTarget(target({ label: 'Mehr', href, linkTarget }), PAGE).safety;
}

describe('classifyTarget: links', () => {
  it('hash-only changes and javascript: links stay on the document', () => {
    expect(link('#reviews')).toBe('safe');
    expect(link('/produkte/sofa?farbe=grau#reviews')).toBe('safe');
    expect(link('javascript:void(0)')).toBe('safe');
  });

  it('other path, other query, other origin, reload and new tab are cross-document', () => {
    expect(link('/produkte/tisch')).toBe('cross-document-navigation');
    expect(link('/produkte/sofa?farbe=blau')).toBe('cross-document-navigation');
    expect(link('https://partner.example/sofa')).toBe('cross-document-navigation');
    expect(link('/produkte/sofa?farbe=grau')).toBe('cross-document-navigation');
    expect(link('#reviews', '_blank')).toBe('cross-document-navigation');
    expect(link('#reviews', '_self')).toBe('safe');
  });
});
