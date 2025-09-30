/**
 * Dictionary with Incremental Rehash (simulated)
 *
 * We use a two-table approach for growing/shrinking dictionaries:
 * - ht[0]: current hash table
 * - ht[1]: new hash table (during rehashing)
 * - rehashidx: tracks which bucket index we're currently migrating
 *
 * During rehash:
 * - Each operation (get, set, del) moves a few buckets from ht[0] to ht[1]
 * - This spreads rehashing cost across many operations (incremental)
 * - Avoids long pauses that would occur with blocking rehash
 * - Lookups check both tables; insertions go to ht[1]
 *
 * In our TS implementation:
 * - We use a Map (no concept of buckets in TS)
 * - We simulate the concept: when growing/shrinking, we gradually migrate entries
 * - Each operation moves up to N entries before proceeding
 * - This demonstrates the incremental rehash pattern
 *
 * Production note:
 * - In a low-level implementation, you'd use actual hash tables with buckets and linked lists
 * - You'd migrate bucket-by-bucket, tracking with rehashidx
 * - Here we migrate entry-by-entry for simplicity
 */

export class Dictionary<K = string, V = any> {
  private ht0: Map<K, V>;
  private ht1: Map<K, V> | null;
  private rehashidx: number;
  private rehashStepSize: number;
  private rehashIterator: Iterator<[K, V]> | null;

  constructor(rehashStepSize: number = 1) {
    this.ht0 = new Map();
    this.ht1 = null;
    this.rehashidx = -1;
    this.rehashStepSize = rehashStepSize;
    this.rehashIterator = null;
  }

  /**
   * Check if we're currently rehashing
   */
  isRehashing(): boolean {
    return this.rehashidx >= 0;
  }

  /**
   * Start rehashing to a new table size.
   * In real Redis, this would be triggered by load factor thresholds.
   * We simulate by just creating ht1 and setting rehashidx.
   */
  private _startRehash(): void {
    if (this.isRehashing()) {
      return;  // Already rehashing
    }

    // Simulate resize decision.
    // For demonstration, we always create a new table with same size
    // In production: calculate new size based on load factor
    this.ht1 = new Map();
    this.rehashidx = 0;
    this.rehashIterator = this.ht0.entries();
  }

  /**
   * Perform incremental rehash step.
   * Migrates up to stepSize entries from ht0 to ht1.
   * Returns true if rehashing is complete.
   */
  private _rehashStep(stepSize: number = this.rehashStepSize): boolean {
    if (!this.isRehashing()) {
      return true;
    }

    if (!this.rehashIterator || !this.ht1) {
      return true;
    }

    let moved = 0;
    while (moved < stepSize) {
      const next = this.rehashIterator.next();
      if (next.done) {
        // Finished migrating all entries
        this.ht0 = this.ht1;
        this.ht1 = null;
        this.rehashidx = -1;
        this.rehashIterator = null;
        return true;
      }

      const [key, value] = next.value;
      this.ht1.set(key, value);
      this.ht0.delete(key);
      moved++;
      this.rehashidx++;
    }

    return false;
  }

  /**
   * Get value for key. Checks both tables during rehash.
   */
  get(key: K): V | undefined {
    this._rehashStep();

    // During rehash, check both tables
    if (this.isRehashing() && this.ht1) {
      const val = this.ht1.get(key);
      if (val !== undefined) return val;
    }

    return this.ht0.get(key);
  }

  /**
   * Set key-value pair. During rehash, always insert to ht1.
   */
  set(key: K, value: V): void {
    this._rehashStep();

    if (this.isRehashing() && this.ht1) {
      // During rehash, new entries go to ht1
      // Also move key from ht0 to ht1 if it exists
      if (this.ht0.has(key)) {
        this.ht0.delete(key);
      }
      this.ht1.set(key, value);
    } else {
      this.ht0.set(key, value);

      // Trigger rehash if table grows too large (simulate load factor check)
      // We use a simple threshold for demonstration
      if (this.ht0.size > 1000 && !this.isRehashing()) {
        this._startRehash();
      }
    }
  }

  /**
   * Delete key. Checks both tables during rehash.
   */
  delete(key: K): boolean {
    this._rehashStep();

    let deleted = false;
    if (this.isRehashing() && this.ht1) {
      deleted = this.ht1.delete(key) || deleted;
    }
    deleted = this.ht0.delete(key) || deleted;

    return deleted;
  }

  /**
   * Check if key exists
   */
  has(key: K): boolean {
    this._rehashStep();

    if (this.isRehashing() && this.ht1 && this.ht1.has(key)) {
      return true;
    }
    return this.ht0.has(key);
  }

  /**
   * Get all keys
   */
  keys(): K[] {
    this._rehashStep();

    const keys = Array.from(this.ht0.keys());
    if (this.isRehashing() && this.ht1) {
      keys.push(...this.ht1.keys());
    }
    return keys;
  }

  /**
   * Get dictionary size
   */
  get size(): number {
    if (this.isRehashing() && this.ht1) {
      return this.ht0.size + this.ht1.size;
    }
    return this.ht0.size;
  }

  /**
   * Force complete rehashing (for testing)
   */
  _forceRehashComplete(): void {
    while (this.isRehashing()) {
      this._rehashStep(100);
    }
  }
}