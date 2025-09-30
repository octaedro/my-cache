import { Dictionary } from './Dictionary.js';
import { ZSet } from '../zset/index.js';
import { TTLManager } from '../expiration/index.js';
import { UsageTracker } from '../eviction/index.js';
import { IntSet } from '../encodings/index.js';
import type { CacheEntry, CacheOptions } from '../types/index.js';

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  operations: number;
  keyCount: number;
  memoryUsed: number;
  hitRate: number;
}

/**
 * Cache - Main cache interface (Optimized version)
 *
 * Features:
 * - Multiple data types: string, zset, set (with intset encoding)
 * - TTL: passive (on access) + active (background sampling) + lazy purging
 * - Eviction: LRU or LFU approximate with pool-based optimization
 * - Incremental rehashing via Dictionary wrapper
 *
 * Optimizations:
 * - Iterator-based TTL sampling (O(k) vs O(N))
 * - Batch delete for expired keys
 * - Dynamic eviction pool sizing based on key count
 * - Incremental memory tracking for ZSET/SET operations
 * - Observability metrics (hits, misses, evictions, etc.)
 * - Validation of eviction pool keys before delete
 */
export class Cache {
  private maxmemory: number;
  private evictionPolicy: 'lru' | 'lfu';
  private evictionSampleSize: number;
  private store: Dictionary<string, CacheEntry>;
  private ttl: TTLManager;
  private usage: UsageTracker;
  private currentMemoryUsed: number;

  // Eviction pool for better eviction candidate selection
  private evictionPool: string[];

  // Lazy expiration counter
  private operationCount: number;
  private readonly LAZY_EXPIRE_FREQ = 100;

  // Statistics for observability
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
    operations: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.maxmemory = options.maxmemory || 100_000_000;  // 100MB default
    this.evictionPolicy = options.evictionPolicy || 'lru';
    this.evictionSampleSize = options.evictionSampleSize || 8;

    this.store = new Dictionary();
    this.ttl = new TTLManager();
    this.usage = new UsageTracker(this.evictionPolicy);
    this.currentMemoryUsed = 0;
    this.evictionPool = [];
    this.operationCount = 0;

    // Start active TTL expiration (reduced frequency for better performance)
    this.ttl.startActiveExpiration((key) => {
      this._deleteKey(key);
      this.stats.expirations++;
    }, 200, 10, 2);
  }

  /**
   * Get dynamic pool size based on key count.
   * More keys = larger pool for better eviction candidate selection.
   */
  private get dynamicPoolSize(): number {
    const size = this.store.size;
    if (size < 1000) return 8;
    if (size < 10000) return 16;
    if (size < 100000) return 32;
    return 64;
  }

  /**
   * Estimate memory size for a ZSET member.
   */
  private _estimateMemberSize(member: string): number {
    return member.length * 2 + 80;  // String + skiplist overhead
  }

  /**
   * Calculate approximate memory used by an entry.
   * More accurate than simple heuristic.
   */
  private _calculateMemoryUsed(key: string, entry: CacheEntry): number {
    let size = key.length * 2; // UTF-16 characters (2 bytes each)

    if (entry.type === 'string') {
      size += String(entry.value).length * 2;
      size += 48; // Object overhead
    } else if (entry.type === 'zset') {
      // Approximate: card * (avg member length + score + skiplist overhead)
      const card = entry.value.zcard();
      size += card * 80; // Conservative estimate per member
    } else if (entry.type === 'set') {
      if (entry.encoding === 'intset') {
        size += entry.value.size * 8; // 8 bytes per integer
      } else {
        size += entry.value.size * 40; // Estimate for Set members
      }
    }

    return size;
  }

  /**
   * Get current memory usage.
   */
  approxMemoryUsed(): number {
    return this.currentMemoryUsed;
  }

  /**
   * Get statistics for observability.
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      memoryUsed: this.currentMemoryUsed,
      keyCount: this.store.size,
    };
  }

  /**
   * Check if key is expired (passive expiration).
   * Performs lazy purging occasionally.
   * Returns true if key was expired and deleted.
   */
  private _checkExpired(key: string): boolean {
    // Lazy expiration: periodically purge expired keys
    this.operationCount++;
    if (this.operationCount % this.LAZY_EXPIRE_FREQ === 0) {
      this.ttl.sampleAndPurge(5, (k) => {
        this._deleteKey(k);
        this.stats.expirations++;
      });
    }

    if (this.ttl.isExpired(key)) {
      this._deleteKey(key);
      this.stats.expirations++;
      return true;
    }
    return false;
  }

  /**
   * Get entry and update access tracking.
   * Avoids redundant touch() calls.
   * Returns null if key doesn't exist or is expired.
   */
  private _getEntry(key: string): CacheEntry | null {
    if (this._checkExpired(key)) {
      return null;
    }

    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    // Update usage tracking once
    this.usage.touch(key);
    return entry;
  }

  /**
   * Internal delete (no expiration check).
   */
  private _deleteKey(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.memoryUsed) {
      this.currentMemoryUsed -= entry.memoryUsed;
    }

    this.store.delete(key);
    this.ttl.delete(key);
    this.usage.delete(key);
  }

  /**
   * Evict keys if over memory limit.
   * Optimized version using eviction pool with validation.
   */
  private _evictIfNeeded(): void {
    if (this.currentMemoryUsed <= this.maxmemory) {
      return;
    }

    while (this.currentMemoryUsed > this.maxmemory && this.store.size > 0) {
      // Refill pool if empty
      if (this.evictionPool.length === 0) {
        const allKeys = this.store.keys();
        if (allKeys.length === 0) break;

        // Sample more keys at once for better selection
        const sampleSize = Math.min(this.evictionSampleSize * 2, allKeys.length);
        const samples: string[] = [];

        // Random sampling without replacement
        const sampled = new Set<string>();
        while (sampled.size < sampleSize) {
          const idx = Math.floor(Math.random() * allKeys.length);
          sampled.add(allKeys[idx]);
        }

        // Collect candidates and sort by eviction priority
        for (const key of sampled) {
          samples.push(key);
        }

        // Sort by eviction quality (lower is better for eviction)
        samples.sort((a, b) => {
          const metaA = this.usage.getMetadata(a);
          const metaB = this.usage.getMetadata(b);

          if (!metaA) return -1;
          if (!metaB) return 1;

          if (this.evictionPolicy === 'lru') {
            // Earlier lastAccess = better candidate
            return metaA.lastAccess - metaB.lastAccess;
          } else {
            // Lower freq = better candidate
            if (metaA.freq !== metaB.freq) {
              return metaA.freq - metaB.freq;
            }
            // Tie-breaker: older access
            return metaA.lastAccess - metaB.lastAccess;
          }
        });

        // Take top candidates into pool (dynamic size)
        this.evictionPool = samples.slice(0, this.dynamicPoolSize);
      }

      // Evict best candidate from pool
      const victim = this.evictionPool.shift();
      if (victim) {
        // Validate key still exists before deleting
        // (could have been deleted by TTL or manual delete)
        if (this.store.has(victim)) {
          this._deleteKey(victim);
          this.stats.evictions++;
        }
        // else: key was already deleted, skip it
      } else {
        break;
      }
    }
  }

  /**
   * SET key value [PX milliseconds]
   */
  set(key: string, value: any, px?: number): void {
    this.stats.operations++;
    this._evictIfNeeded();

    // Remove old entry memory usage if exists
    const oldEntry = this.store.get(key);
    if (oldEntry && oldEntry.memoryUsed) {
      this.currentMemoryUsed -= oldEntry.memoryUsed;
    }

    const entry: CacheEntry = { type: 'string', value };
    entry.memoryUsed = this._calculateMemoryUsed(key, entry);
    this.currentMemoryUsed += entry.memoryUsed;

    this.store.set(key, entry);
    this.usage.touch(key);

    if (px !== undefined && px > 0) {
      this.ttl.set(key, Date.now() + px);
    } else {
      this.ttl.delete(key);
    }
  }

  /**
   * GET key
   */
  get(key: string): any {
    this.stats.operations++;

    const entry = this._getEntry(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.type !== 'string') {
      throw new Error('WRONGTYPE');
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * DEL key
   */
  del(key: string): number {
    this.stats.operations++;

    const existed = this.store.has(key);
    if (existed) {
      this._deleteKey(key);
      return 1;
    }
    return 0;
  }

  /**
   * ZADD key score member
   */
  zadd(key: string, score: number, member: string): number {
    this.stats.operations++;

    if (this._checkExpired(key)) {
      // Key expired, treat as new
    }

    this._evictIfNeeded();

    let entry = this.store.get(key);

    if (!entry) {
      // New zset
      const zset = new ZSet();
      const added = zset.zadd(member, score);
      entry = { type: 'zset', value: zset };
      entry.memoryUsed = this._calculateMemoryUsed(key, entry);
      this.currentMemoryUsed += entry.memoryUsed;
      this.store.set(key, entry);
      this.usage.touch(key);
      return added ? 1 : 0;
    }

    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE');
    }

    // Incremental memory update for better performance
    const added = entry.value.zadd(member, score);

    if (added) {
      // New member added - estimate size delta
      const delta = this._estimateMemberSize(member);
      entry.memoryUsed = (entry.memoryUsed || 0) + delta;
      this.currentMemoryUsed += delta;
    }
    // else: just score update, size unchanged

    this.usage.touch(key);
    return added ? 1 : 0;
  }

  /**
   * ZREM key member
   */
  zrem(key: string, member: string): number {
    this.stats.operations++;

    const entry = this._getEntry(key);
    if (!entry) {
      return 0;
    }

    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE');
    }

    // Incremental memory update
    const removed = entry.value.zrem(member);
    if (removed && entry.memoryUsed) {
      const delta = this._estimateMemberSize(member);
      entry.memoryUsed = Math.max(0, entry.memoryUsed - delta);
      this.currentMemoryUsed = Math.max(0, this.currentMemoryUsed - delta);
    }

    return removed ? 1 : 0;
  }

  /**
   * ZSCORE key member
   */
  zscore(key: string, member: string): number | null {
    this.stats.operations++;

    const entry = this._getEntry(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE');
    }

    this.stats.hits++;
    return entry.value.zscore(member);
  }

  /**
   * ZRANK key member
   */
  zrank(key: string, member: string): number | null {
    this.stats.operations++;

    const entry = this._getEntry(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE');
    }

    this.stats.hits++;
    return entry.value.zrank(member);
  }

  /**
   * ZRANGEBYSCORE key min max [LIMIT count]
   */
  zrangeByScore(key: string, min: number, max: number, limit?: number): [string, number][] {
    this.stats.operations++;

    const entry = this._getEntry(key);
    if (!entry) {
      this.stats.misses++;
      return [];
    }

    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE');
    }

    this.stats.hits++;
    return entry.value.zrangeByScore(min, max, limit);
  }

  /**
   * SADD key member [member ...]
   * Demonstrates IntSet encoding with auto-upgrade to Set
   */
  sadd(key: string, ...members: any[]): number {
    this.stats.operations++;

    if (this._checkExpired(key)) {
      // Key expired, treat as new
    }

    this._evictIfNeeded();

    let entry = this.store.get(key);
    let addedCount = 0;

    if (!entry) {
      // New set - start with IntSet
      const intset = new IntSet();
      entry = { type: 'set', value: intset, encoding: 'intset' };
      entry.memoryUsed = this._calculateMemoryUsed(key, entry);
      this.currentMemoryUsed += entry.memoryUsed;
      this.store.set(key, entry);
    }

    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE');
    }

    // Track size before additions for incremental update
    const oldSize = entry.value.size;

    for (const member of members) {
      if (entry.encoding === 'intset') {
        const result = entry.value.add(member);
        if (result === 'upgrade') {
          // Upgrade to Set
          entry.value = entry.value.upgradeToSet();
          entry.encoding = 'hashtable';
          if (!entry.value.has(member)) {
            entry.value.add(member);
            addedCount++;
          }
        } else if (result === true) {
          addedCount++;
        }
      } else {
        // Already hashtable
        if (!entry.value.has(member)) {
          entry.value.add(member);
          addedCount++;
        }
      }
    }

    // Incremental memory update
    if (addedCount > 0) {
      const newSize = entry.value.size;
      const sizeDelta = newSize - oldSize;
      const memoryDelta = sizeDelta * (entry.encoding === 'intset' ? 8 : 40);
      entry.memoryUsed = (entry.memoryUsed || 0) + memoryDelta;
      this.currentMemoryUsed += memoryDelta;
    }

    this.usage.touch(key);
    return addedCount;
  }

  /**
   * SMEMBERS key
   */
  smembers(key: string): any[] {
    this.stats.operations++;

    const entry = this._getEntry(key);
    if (!entry) {
      this.stats.misses++;
      return [];
    }

    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE');
    }

    this.stats.hits++;
    return Array.from(entry.value.values ? entry.value.values() : entry.value);
  }

  /**
   * Stop background tasks (for clean shutdown)
   */
  shutdown(): void {
    // Flush any pending TTL deletes
    this.ttl.flushPendingDeletes((key) => {
      this._deleteKey(key);
      this.stats.expirations++;
    });

    this.ttl.stopActiveExpiration();
    this.usage.stopDecay();
  }
}