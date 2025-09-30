/**
 * Eviction Module - Approximate LRU and LFU
 *
 * Approximation strategies:
 * - LRU: track last access time, sample N keys, evict oldest
 * - LFU: probabilistic counter with decay
 *
 * LFU counter details:
 * - 8-bit counter (0-255) to save memory
 * - Probabilistic increment: p = 1/(1 + freq), prevents rapid saturation
 * - Periodic decay: every decayInterval, freq = max(0, freq - decayAmount)
 * - This approximates true frequency while being memory-efficient
 */

import type { EvictionPolicy, UsageMetadata } from '../types/index.js';

export class UsageTracker {
  private policy: EvictionPolicy;
  private metadata: Map<string, UsageMetadata>;
  private decayInterval: number;
  private decayAmount: number;
  private decayTimer: NodeJS.Timeout | null;

  constructor(evictionPolicy: EvictionPolicy = 'lru', decayInterval: number = 60000, decayAmount: number = 1) {
    this.policy = evictionPolicy;
    this.metadata = new Map();
    this.decayInterval = decayInterval;
    this.decayAmount = decayAmount;
    this.decayTimer = null;

    if (this.policy === 'lfu') {
      this.startDecay();
    }
  }

  /**
   * Record access to a key.
   * LRU: updates lastAccess time
   * LFU: updates lastAccess + probabilistically increments frequency counter
   */
  touch(key: string): void {
    const now = Date.now();
    let meta = this.metadata.get(key);

    if (!meta) {
      meta = { lastAccess: now, freq: 0, lastDecay: now };
      this.metadata.set(key, meta);
    }

    meta.lastAccess = now;

    if (this.policy === 'lfu') {
      // Probabilistic increment: as frequency grows, increment probability decreases
      // This prevents hot keys from saturating the counter too quickly
      const probability = 1 / (1 + meta.freq);
      if (Math.random() < probability && meta.freq < 255) {
        meta.freq++;
      }
    }
  }

  /**
   * Remove metadata for a key
   */
  delete(key: string): void {
    this.metadata.delete(key);
  }

  /**
   * Start periodic decay for LFU counters.
   * Reduces all frequency counters by decayAmount every decayInterval.
   * This ensures old frequencies don't prevent new hot keys from being retained.
   */
  startDecay(): void {
    if (this.decayTimer) {
      return;
    }

    this.decayTimer = setInterval(() => {
      const now = Date.now();
      for (const [_key, meta] of this.metadata.entries()) {
        // Decay if enough time has passed
        if (now - meta.lastDecay >= this.decayInterval) {
          meta.freq = Math.max(0, meta.freq - this.decayAmount);
          meta.lastDecay = now;
        }
      }
    }, this.decayInterval);
  }

  /**
   * Stop periodic decay
   */
  stopDecay(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
  }

  /**
   * Get metadata for a key (for testing/debugging)
   */
  getMetadata(key: string): UsageMetadata | undefined {
    return this.metadata.get(key);
  }
}