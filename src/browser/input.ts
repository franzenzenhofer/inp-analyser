import type { CDPSession } from 'puppeteer-core';
import type { Device } from '../model/scenario.js';

export interface Point { readonly x: number; readonly y: number }

/**
 * Trusted input through the CDP Input domain - the same path as real input, verified in
 * tests/e2e/spike-input.test.ts. Press and release are sent back to back WITHOUT awaiting the renderer's
 * acknowledgement in between: Input.dispatch* blocks while the main thread is busy, and a real finger
 * does not wait for the page either. Points are viewport (CSS px) coordinates.
 */
async function tap(client: CDPSession, p: Point): Promise<void> {
  const touchPoints = [{ x: p.x, y: p.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
  const down = client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  const up = client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await Promise.all([down, up]);
}

async function click(client: CDPSession, p: Point): Promise<void> {
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  const down = client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  const up = client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
  await Promise.all([down, up]);
}

/** Tap on mobile (touch events), click on desktop (mouse events). */
export async function pointerActivate(client: CDPSession, device: Device, p: Point): Promise<void> {
  await (device === 'mobile' ? tap(client, p) : click(client, p));
}

/** One printable key press = keydown + char + keyup, the events Event Timing groups into one interaction. */
export async function pressCharacter(client: CDPSession, char: string): Promise<void> {
  if (char.length !== 1) {
    throw new Error(`[input] pressCharacter expects one character, got "${char}"`);
  }
  const down = client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: char, text: char, unmodifiedText: char });
  const up = client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: char });
  await Promise.all([down, up]);
}

export async function pressEscape(client: CDPSession): Promise<void> {
  const base = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
