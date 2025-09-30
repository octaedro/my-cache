/**
 * IntSet - Compact representation for small integer-only sets
 * Auto-upgrades to Set when:
 * - Size exceeds threshold (default 512)
 * - Non-integer value is added
 */
export class IntSet {
  private data: number[];
  private maxSize: number;
  public isIntSet: boolean;

  constructor(maxSize: number = 512) {
    this.data = [];
    this.maxSize = maxSize;
    this.isIntSet = true;
  }

  /**
   * Add integer to set. Returns 'upgrade' if upgrade needed, true if added, false if exists.
   */
  add(value: any): 'upgrade' | boolean {
    // Check if value is integer
    if (!Number.isInteger(value)) {
      return 'upgrade';
    }

    // Binary search for insertion point
    let low = 0, high = this.data.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.data[mid] === value) {
        return false;  // Already exists
      }
      if (this.data[mid] < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    // Check size threshold before inserting
    if (this.data.length >= this.maxSize) {
      return 'upgrade';
    }

    this.data.splice(low, 0, value);
    return true;
  }

  has(value: any): boolean {
    return this.data.includes(value);
  }

  delete(value: any): boolean {
    const idx = this.data.indexOf(value);
    if (idx >= 0) {
      this.data.splice(idx, 1);
      return true;
    }
    return false;
  }

  get size(): number {
    return this.data.length;
  }

  values(): Iterator<number> {
    return this.data[Symbol.iterator]();
  }

  /**
   * Upgrade to standard Set
   */
  upgradeToSet(): Set<number> {
    return new Set(this.data);
  }
}