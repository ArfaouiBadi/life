/** Fixed-capacity ring buffer. */
export class Ring<T> {
  private buf: T[] = [];
  private start = 0;
  readonly cap: number;
  constructor(cap: number) {
    this.cap = cap;
  }

  push(v: T) {
    if (this.buf.length < this.cap) this.buf.push(v);
    else {
      this.buf[this.start] = v;
      this.start = (this.start + 1) % this.cap;
    }
  }

  get length() {
    return this.buf.length;
  }

  /** i = 0 is the oldest element. */
  at(i: number): T {
    return this.buf[(this.start + i) % this.buf.length];
  }

  last(): T | undefined {
    if (!this.buf.length) return undefined;
    return this.buf[(this.start + this.buf.length - 1) % this.buf.length];
  }

  toArray(): T[] {
    return this.buf.length < this.cap ? this.buf.slice() : [...this.buf.slice(this.start), ...this.buf.slice(0, this.start)];
  }

  clear() {
    this.buf = [];
    this.start = 0;
  }
}
