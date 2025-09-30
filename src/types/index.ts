/**
 * Shared type definitions
 */

export type DataType = 'string' | 'zset' | 'set';
export type Encoding = 'intset' | 'hashtable';
export type EvictionPolicy = 'lru' | 'lfu';

export interface CacheEntry {
  type: DataType;
  value: any;
  encoding?: Encoding;
  memoryUsed?: number;
}

export interface CacheOptions {
  maxmemory?: number;
  evictionPolicy?: EvictionPolicy;
  evictionSampleSize?: number;
  avgKeySize?: number;
}

export interface UsageMetadata {
  lastAccess: number;
  freq: number;
  lastDecay: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  operations: number;
  keyCount: number;
  memoryUsed: number;
  hitRate: number;
}

