/**
 * TTL Manager
 * Tracks expiration times for keys and provides active expiration via sampling.
 *
 * Active expiration strategy:
 * - Every 100ms, sample a random subset of TTL keys (default 20)
 * - If more than 25% are expired, run another sampling round
 * - Cap sampling rounds to prevent blocking (max 4 iterations per cycle)
 * - This amortizes expiration cost and prevents memory leaks from never-accessed keys
 */
export class TTLManager {
  private expirations: Map<string, number>;
  private interval: NodeJS.Timeout | null;
  private keyIterator: Iterator<string> | null;
  private pendingDeletes: string[];

  constructor() {
    this.expirations = new Map();
    this.interval = null;
    this.keyIterator = null;
    this.pendingDeletes = [];
  }

  /**
   * Set TTL for a key (absolute expiration time in ms)
   */
  set(key: string, expiresAtMs: number): void {
    this.expirations.set(key, expiresAtMs);
  }

  /**
   * Remove TTL for a key
   */
  delete(key: string): void {
    this.expirations.delete(key);
  }

  /**
   * Check if key is expired (passive expiration)
   */
  isExpired(key: string): boolean {
    const expiresAt = this.expirations.get(key);
    if (expiresAt === undefined) {
      return false;
    }
    return Date.now() >= expiresAt;
  }

  /**
   * Get expiration time for a key
   */
  getExpiration(key: string): number | undefined {
    return this.expirations.get(key);
  }

  /**
   * Sample up to k keys with TTL using iterator and check expiration.
   * Optimized: uses iterator instead of creating full array (O(k) vs O(N)).
   * Batches deletes for efficiency.
   * Returns count of expired keys found.
   */
  sampleAndPurge(k: number, onExpire: (key: string) => void): number {
    if (this.expirations.size === 0) {
      return 0;
    }

    const now = Date.now();
    let expiredCount = 0;

    // Create new iterator if needed
    if (!this.keyIterator) {
      this.keyIterator = this.expirations.keys();
    }

    // Sample k keys using iterator (no full array allocation!)
    for (let i = 0; i < k; i++) {
      const next = this.keyIterator.next();

      if (next.done) {
        // Wrap around to beginning
        this.keyIterator = this.expirations.keys();
        const nextKey = this.keyIterator.next();
        if (nextKey.done) break; // Map is empty

        const expiresAt = this.expirations.get(nextKey.value);
        if (expiresAt && now >= expiresAt) {
          expiredCount++;
          this.pendingDeletes.push(nextKey.value);
        }
      } else {
        const expiresAt = this.expirations.get(next.value);
        if (expiresAt && now >= expiresAt) {
          expiredCount++;
          this.pendingDeletes.push(next.value);
        }
      }
    }

    // Batch delete: process when we have enough pending or force flush
    if (this.pendingDeletes.length >= 100) {
      this._flushPendingDeletes(onExpire);
    }

    return expiredCount;
  }

  /**
   * Flush pending deletes (internal helper)
   */
  private _flushPendingDeletes(onExpire: (key: string) => void): void {
    for (const key of this.pendingDeletes) {
      onExpire(key);
    }
    this.pendingDeletes = [];
  }

  /**
   * Force flush any pending deletes (called on shutdown or manually)
   */
  flushPendingDeletes(onExpire: (key: string) => void): void {
    if (this.pendingDeletes.length > 0) {
      this._flushPendingDeletes(onExpire);
    }
  }

  /**
   * Start active expiration loop.
   * Runs every intervalMs (default 100ms).
   * If >25% of sampled keys are expired, runs up to maxRounds additional sampling rounds.
   */
  startActiveExpiration(
    onExpire: (key: string) => void,
    intervalMs: number = 100,
    sampleSize: number = 20,
    maxRounds: number = 4
  ): void {
    if (this.interval) {
      return;  // Already running
    }

    this.interval = setInterval(() => {
      let rounds = 0;
      let expiredCount = 0;
      let sampledCount = 0;

      do {
        const sampled = Math.min(sampleSize, this.expirations.size);
        if (sampled === 0) break;

        expiredCount = this.sampleAndPurge(sampled, onExpire);
        sampledCount = sampled;
        rounds++;

        // Continue if >25% expired and haven't hit max rounds
      } while (expiredCount > sampledCount * 0.25 && rounds < maxRounds);
    }, intervalMs);
  }

  /**
   * Stop active expiration loop
   */
  stopActiveExpiration(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get count of keys with TTL
   */
  size(): number {
    return this.expirations.size;
  }
}