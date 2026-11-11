/**
 * The DevTools trace engine expects a browser global DOMRect (its own analyze-trace.mjs polyfills it too).
 * Minimal spec-shaped implementation: https://drafts.fxtf.org/geometry/#domrect
 */
class NodeDOMRect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}
  get top(): number { return Math.min(this.y, this.y + this.height); }
  get left(): number { return Math.min(this.x, this.x + this.width); }
  get right(): number { return Math.max(this.x, this.x + this.width); }
  get bottom(): number { return Math.max(this.y, this.y + this.height); }
  static fromRect(rect: Partial<Pick<NodeDOMRect, 'x' | 'y' | 'width' | 'height'>> = {}): NodeDOMRect {
    return new NodeDOMRect(rect.x, rect.y, rect.width, rect.height);
  }
  toJSON(): Record<string, number> {
    return { x: this.x, y: this.y, width: this.width, height: this.height, top: this.top, left: this.left, right: this.right, bottom: this.bottom };
  }
}

export function ensureDomRect(): void {
  if (!('DOMRect' in globalThis)) {
    Object.defineProperty(globalThis, 'DOMRect', { value: NodeDOMRect, configurable: true, writable: true });
  }
}
