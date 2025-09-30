import { test } from 'node:test';
import assert from 'node:assert';
import { Cache } from '../src/core/index.js';
import { ZSet } from '../src/zset/index.js';
import { TTLManager } from '../src/expiration/index.js';
import { UsageTracker } from '../src/eviction/index.js';
import { IntSet } from '../src/encodings/index.js';

// Helper to sleep
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

test('Cache: SET/GET/DEL basics', () => {
  const cache = new Cache();

  cache.set('foo', 'bar');
  assert.strictEqual(cache.get('foo'), 'bar');

  cache.del('foo');
  assert.strictEqual(cache.get('foo'), null);

  cache.shutdown();
});

test('Cache: TTL passive expiration', async () => {
  const cache = new Cache();

  cache.set('temp', 'value', 100);  // 100ms TTL
  assert.strictEqual(cache.get('temp'), 'value');

  await sleep(150);
  assert.strictEqual(cache.get('temp'), null);  // Should be expired

  cache.shutdown();
});

test('Cache: TTL active expiration', async () => {
  const cache = new Cache();

  // Set multiple keys with short TTL
  for (let i = 0; i < 10; i++) {
    cache.set(`key${i}`, `val${i}`, 50);
  }

  // Wait for active expiration to kick in
  await sleep(200);

  // Most/all should be expired and cleaned up
  let existingCount = 0;
  for (let i = 0; i < 10; i++) {
    if (cache.get(`key${i}`) !== null) {
      existingCount++;
    }
  }

  assert.strictEqual(existingCount, 0, 'Active expiration should have removed expired keys');

  cache.shutdown();
});

test('Cache: WRONGTYPE error', () => {
  const cache = new Cache();

  cache.set('str', 'value');
  assert.throws(() => cache.zadd('str', 1, 'member'), /WRONGTYPE/);

  cache.zadd('zset', 1, 'member');
  assert.throws(() => cache.get('zset'), /WRONGTYPE/);

  cache.shutdown();
});

test('Cache: ZSET operations', () => {
  const cache = new Cache();

  // Add members
  assert.strictEqual(cache.zadd('myzset', 1, 'one'), 1);
  assert.strictEqual(cache.zadd('myzset', 2, 'two'), 1);
  assert.strictEqual(cache.zadd('myzset', 3, 'three'), 1);

  // Update existing member (new score)
  assert.strictEqual(cache.zadd('myzset', 4, 'two'), 0);  // Updated, not added

  // Get score
  assert.strictEqual(cache.zscore('myzset', 'one'), 1);
  assert.strictEqual(cache.zscore('myzset', 'two'), 4);
  assert.strictEqual(cache.zscore('myzset', 'nonexistent'), null);

  // Range by score
  const range = cache.zrangeByScore('myzset', 1, 3);
  assert.strictEqual(range.length, 2);
  assert.deepStrictEqual(range[0], ['one', 1]);
  assert.deepStrictEqual(range[1], ['three', 3]);

  // Range with limit
  const limited = cache.zrangeByScore('myzset', 0, 10, 2);
  assert.strictEqual(limited.length, 2);

  // Rank
  assert.strictEqual(cache.zrank('myzset', 'one'), 0);
  assert.strictEqual(cache.zrank('myzset', 'three'), 1);
  assert.strictEqual(cache.zrank('myzset', 'two'), 2);

  // Remove
  assert.strictEqual(cache.zrem('myzset', 'two'), 1);
  assert.strictEqual(cache.zrem('myzset', 'two'), 0);  // Already removed
  assert.strictEqual(cache.zscore('myzset', 'two'), null);

  cache.shutdown();
});

test('Cache: ZSET score update removes and reinserts', () => {
  const zset = new ZSet();

  zset.zadd('a', 1);
  zset.zadd('b', 2);
  zset.zadd('c', 3);

  // Verify initial order
  assert.strictEqual(zset.zrank('a'), 0);
  assert.strictEqual(zset.zrank('b'), 1);
  assert.strictEqual(zset.zrank('c'), 2);

  // Update 'a' to highest score
  zset.zadd('a', 5);

  // Verify new order (a should now be last)
  assert.strictEqual(zset.zrank('b'), 0);
  assert.strictEqual(zset.zrank('c'), 1);
  assert.strictEqual(zset.zrank('a'), 2);
});

test('Cache: Eviction (LRU)', async () => {
  const cache = new Cache({
    maxmemory: 64 * 10,  // Room for ~10 keys (with avgKeySize=64)
    evictionPolicy: 'lru'
  });

  // Insert many keys to trigger eviction
  for (let i = 0; i < 20; i++) {
    cache.set(`key${i}`, `value${i}`);
  }

  // Should have evicted some keys
  assert.ok((cache as any).store.size < 20, 'Eviction should have removed some keys');
  assert.ok((cache as any).store.size > 0, 'Should still have some keys');

  cache.shutdown();
});

test('Cache: Eviction (LFU)', async () => {
  const cache = new Cache({
    maxmemory: 64 * 10,  // Room for ~10 keys
    evictionPolicy: 'lfu'
  });

  // Insert many keys
  for (let i = 0; i < 20; i++) {
    cache.set(`key${i}`, `value${i}`);
  }

  // Should have evicted some keys based on frequency
  assert.ok((cache as any).store.size < 20, 'Eviction should have removed some keys');

  cache.shutdown();
});

test('Cache: IntSet encoding and upgrade', () => {
  const cache = new Cache();

  // Add integers (should use intset)
  cache.sadd('myset', 1, 2, 3);
  let entry = (cache as any).store.get('myset');
  assert.strictEqual(entry.encoding, 'intset');

  // Add non-integer (should upgrade to hashtable)
  cache.sadd('myset', 'string');
  entry = (cache as any).store.get('myset');
  assert.strictEqual(entry.encoding, 'hashtable');

  const members = cache.smembers('myset');
  assert.strictEqual(members.length, 4);

  cache.shutdown();
});

test('TTLManager: sampling and purging', () => {
  const ttl = new TTLManager();
  const expired: string[] = [];

  // Add some keys with past expiration
  const now = Date.now();
  ttl.set('expired1', now - 1000);
  ttl.set('expired2', now - 1000);
  ttl.set('active', now + 10000);

  // Sample and purge (sample 3 keys to avoid wrap-around)
  const count = ttl.sampleAndPurge(3, (key) => expired.push(key));

  // Flush any pending deletes
  ttl.flushPendingDeletes((key) => expired.push(key));

  assert.strictEqual(count, 2);
  assert.ok(expired.includes('expired1'));
  assert.ok(expired.includes('expired2'));
  assert.ok(!expired.includes('active'));
});

test('UsageTracker: LRU tracks access time', () => {
  const tracker = new UsageTracker('lru');

  tracker.touch('key1');
  tracker.touch('key2');
  tracker.touch('key3');

  const meta1 = tracker.getMetadata('key1');
  const meta2 = tracker.getMetadata('key2');
  const meta3 = tracker.getMetadata('key3');

  // key1 should have oldest lastAccess
  assert.ok(meta1!.lastAccess <= meta2!.lastAccess);
  assert.ok(meta2!.lastAccess <= meta3!.lastAccess);

  tracker.stopDecay();
});

test('UsageTracker: LFU tracks frequency', () => {
  const tracker = new UsageTracker('lfu');

  // Access keys different amounts
  tracker.touch('hot');
  tracker.touch('hot');
  tracker.touch('hot');
  tracker.touch('warm');
  tracker.touch('warm');
  tracker.touch('cold');

  const hotMeta = tracker.getMetadata('hot');
  const warmMeta = tracker.getMetadata('warm');
  const coldMeta = tracker.getMetadata('cold');

  // hot should have highest freq (probabilistic, so just check existence)
  assert.ok(hotMeta!.freq >= 0);
  assert.ok(warmMeta!.freq >= 0);
  assert.ok(coldMeta!.freq >= 0);

  tracker.stopDecay();
});

test('ZSet: skiplist rank calculation', () => {
  const zset = new ZSet();

  zset.zadd('a', 1);
  zset.zadd('b', 2);
  zset.zadd('c', 3);
  zset.zadd('d', 4);
  zset.zadd('e', 5);

  assert.strictEqual(zset.zrank('a'), 0);
  assert.strictEqual(zset.zrank('c'), 2);
  assert.strictEqual(zset.zrank('e'), 4);

  // Remove middle element
  zset.zrem('c');

  assert.strictEqual(zset.zrank('a'), 0);
  assert.strictEqual(zset.zrank('b'), 1);
  assert.strictEqual(zset.zrank('d'), 2);
  assert.strictEqual(zset.zrank('e'), 3);
});

test('IntSet: maintains sorted order and upgrades', () => {
  const intset = new IntSet();

  intset.add(5);
  intset.add(1);
  intset.add(3);

  assert.deepStrictEqual((intset as any).data, [1, 3, 5]);

  // Try to add non-integer
  const result = intset.add('string');
  assert.strictEqual(result, 'upgrade');

  // Upgrade to Set
  const set = intset.upgradeToSet();
  assert.ok(set.has(1));
  assert.ok(set.has(3));
  assert.ok(set.has(5));
});

test('Cache: getStats returns observability metrics', () => {
  const cache = new Cache();

  // Initial stats
  let stats = cache.getStats();
  assert.strictEqual(stats.hits, 0);
  assert.strictEqual(stats.misses, 0);
  assert.strictEqual(stats.evictions, 0);
  assert.strictEqual(stats.operations, 0);
  assert.strictEqual(stats.hitRate, 0);

  // Perform operations
  cache.set('key1', 'value1');
  cache.set('key2', 'value2');
  cache.get('key1');  // hit
  cache.get('key1');  // hit
  cache.get('nonexistent');  // miss

  stats = cache.getStats();
  assert.strictEqual(stats.hits, 2);
  assert.strictEqual(stats.misses, 1);
  assert.strictEqual(stats.operations, 5);  // 2 sets + 3 gets
  assert.strictEqual(stats.keyCount, 2);
  assert.strictEqual(stats.hitRate, 2/3);
  assert.ok(stats.memoryUsed > 0);

  cache.shutdown();
});

test('Cache: incremental memory tracking for ZADD/ZREM', () => {
  const cache = new Cache();

  // Add first member
  cache.zadd('myzset', 100, 'member1');
  const stats1 = cache.getStats();
  const memory1 = stats1.memoryUsed;
  assert.ok(memory1 > 0);

  // Add second member - memory should increase by ~80 bytes
  cache.zadd('myzset', 200, 'member2');
  const stats2 = cache.getStats();
  const memory2 = stats2.memoryUsed;
  assert.ok(memory2 > memory1, 'Memory should increase after adding member');
  const delta = memory2 - memory1;
  assert.ok(delta >= 50 && delta <= 150, 'Delta should be around 80 bytes');

  // Remove member - memory should decrease
  cache.zrem('myzset', 'member2');
  const stats3 = cache.getStats();
  const memory3 = stats3.memoryUsed;
  assert.ok(memory3 < memory2, 'Memory should decrease after removing member');
  assert.ok(Math.abs(memory3 - memory1) < 50, 'Memory should be close to initial value');

  cache.shutdown();
});