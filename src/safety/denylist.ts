/**
 * Labels and URLs that mean money, deletion, logout or cancellation (EN/DE/FR/IT/ES). Matched case-
 * insensitively with a left word boundary only, so German compounds and inflections still match
 * ("kostenpflichtig bestellen", "Abo kündigen", "/checkout/step-1", "eliminare"). False positives are
 * accepted: an excluded target costs a measurement, a wrong click can cost money.
 */
export const DANGEROUS_TERMS: readonly string[] = [
  // money
  'buy', 'purchase', 'order now', 'place order', 'checkout', 'pay', 'add to cart', 'add to basket',
  'kaufen', 'jetzt kaufen', 'bestellen', 'zur kasse', 'kasse', 'bezahlen', 'zahlen', 'zahlungspflichtig', 'in den warenkorb',
  'acheter', 'commander', 'payer', 'ajouter au panier',
  'acquista', 'ordina', 'paga', 'aggiungi al carrello',
  'comprar', 'pagar', 'tramitar pedido', 'añadir al carrito',
  // deletion
  'delete', 'remove', 'löschen', 'entfernen', 'supprimer', 'elimina', 'eliminar', 'borrar', 'cancella',
  // subscriptions and accounts
  'unsubscribe', 'abmelden', 'abbestellen', 'cancel subscription', 'cancel membership', 'cancel order',
  'kündigen', 'stornieren', 'résilier', 'désabonner', 'se désabonner', 'disdici', 'annulla iscrizione', 'darse de baja',
  // session
  'logout', 'log out', 'sign out', 'signout', 'ausloggen', 'déconnexion', 'se déconnecter', 'esci', 'cerrar sesión',
];

const escapeRegExp = (term: string): string => term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const DENYLIST_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(${DANGEROUS_TERMS.map(escapeRegExp).toSorted((a, b) => b.length - a.length).join('|')})`,
  'iu',
);

/** Lowercase, NFC, separators (-, _, /, +, whitespace) folded into single spaces. */
export function normaliseText(text: string): string {
  return text.normalize('NFC').toLowerCase().replaceAll(/[\s_+\-/]+/g, ' ').trim();
}

/** Percent-decoded URL text; a malformed escape leaves the raw text, which is matched as is. */
export function decodedUrl(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/** The first denylisted term found in `text`, or null. */
export function dangerousTerm(text: string): string | null {
  const match = DENYLIST_PATTERN.exec(normaliseText(text));
  return match === null ? null : (match[1] ?? null);
}
