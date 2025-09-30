# My Cache

A high-performance in-memory cache service inspired by Redis internals. Built from scratch in TypeScript with ESM, focusing on performance and internal mechanisms.

## Homework Requirements ✓

This project fulfills all requirements:

1. ✅ **Standalone caching service** - Written in TypeScript, runs as HTTP server
2. ✅ **Add/Remove/Fetch operations** - `SET`, `GET`, `DEL` endpoints (+ advanced ZSET operations)
3. ✅ **Optimized data structures** - Dictionary with incremental rehash, ZSet with skiplist, IntSet encoding
4. ✅ **HTTP JSON API** - Simple REST API for easy testing
5. ✅ **Runnable service** - `npm install && npm run dev` to start
6. ✅ **Focus on cache internals** - Implements LRU/LFU eviction, TTL expiration, memory tracking, and multiple optimizations
7. ✅ **Valid package.json** - Includes all scripts and dependencies

**Quick test:** Start server with `npm run dev`, then run `npm run test:homework` to verify all basic operations. See [Quick Test](#quick-test---minimum-requirements) section below for details.

## Features

### Core Data Structures

- **Strings**: Basic key-value storage with TTL support
- **Sorted Sets (ZSET)**: Dual index with skiplist (range by score) + hash (O(1) member lookup)
- **Sets**: IntSet encoding for small integer sets, auto-upgrade to hash table

### Performance Optimizations

- **Incremental Rehash**: Dictionary growth/shrink spreads cost across operations to avoid long pauses
- **Compact Encodings**: IntSet for small integer sets, listpack/quicklist for lists (saves memory)
- **Optimized Eviction**: Pool-based eviction with dynamic sizing (8-64 keys) and validation
- **Active + Passive TTL Expiration**: Background sampling loop + on-access checks + lazy purging with batch delete
- **Iterator-Based Sampling**: O(k) TTL sampling vs O(N) for better performance
- **Incremental Memory Tracking**: Delta-based updates for ZSET/SET operations instead of full recalculation
- **Accurate Memory Tracking**: Per-entry memory accounting for precise eviction decisions
- **Observability Metrics**: Built-in hit rate, miss rate, eviction and expiration tracking

### Memory Management

- **Configurable max memory** with automatic eviction
- **LFU with probabilistic counters**: 8-bit frequency counter with decay to prevent saturation
- **LRU with timestamp tracking**: Evicts least recently accessed keys
- **Dynamic eviction pool**: Adaptive pool size (8-64) with validation for faster eviction

## Quick Start

```bash
cd my-cache
npm install

# Development mode (no build required)
npm run dev

# Or build and run
npm start
```

Server starts on port `7379` (configurable via `PORT` env var).

## Quick Test - Minimum Requirements

Test the basic cache operations (add, fetch, remove):

```bash
# Terminal 1: Start the server
npm run dev

# Terminal 2: Run the automated test
npm run test:homework

# Or manually test with curl:

# ADD an item
curl -X POST http://localhost:7379/set \
  -H "Content-Type: application/json" \
  -d '{"key":"mykey","value":"myvalue"}'
# {"ok":true}

# FETCH the item
curl http://localhost:7379/get?key=mykey
# {"value":"myvalue"}

# REMOVE the item
curl -X POST http://localhost:7379/del \
  -H "Content-Type: application/json" \
  -d '{"key":"mykey"}'
# {"deleted":1}

# FETCH again (should be null)
curl http://localhost:7379/get?key=mykey
# {"value":null}
```

## API Endpoints

### Health Check

```bash
curl http://localhost:7379/health
# {"ok":true}
```

### String Operations

**SET** - Store a key-value pair with optional TTL

```bash
curl -X POST http://localhost:7379/set \
  -H "Content-Type: application/json" \
  -d '{"key":"foo","value":"bar","px":2000}'
# {"ok":true}
```

**GET** - Retrieve a value by key

```bash
curl http://localhost:7379/get?key=foo
# {"value":"bar"}
```

**DEL** - Delete a key

```bash
curl -X POST http://localhost:7379/del \
  -H "Content-Type: application/json" \
  -d '{"key":"foo"}'
# {"deleted":1}
```

### Sorted Set (ZSET) Operations

**ZADD** - Add member with score to sorted set

```bash
curl -X POST http://localhost:7379/zadd \
  -H "Content-Type: application/json" \
  -d '{"key":"leaderboard","score":100,"member":"player1"}'
# {"added":1}

curl -X POST http://localhost:7379/zadd \
  -H "Content-Type: application/json" \
  -d '{"key":"leaderboard","score":200,"member":"player2"}'
# {"added":1}
```

**ZSCORE** - Get score of a member

```bash
curl "http://localhost:7379/zscore?key=leaderboard&member=player1"
# {"score":100}
```

**ZRANGEBYSCORE** - Get members by score range

```bash
curl "http://localhost:7379/zrangeByScore?key=leaderboard&min=50&max=150&limit=10"
# {"items":[["player1",100]]}
```

**ZREM** - Remove a member

```bash
curl -X POST http://localhost:7379/zrem \
  -H "Content-Type: application/json" \
  -d '{"key":"leaderboard","member":"player1"}'
# {"removed":1}
```

## Testing

### Run Functional Tests

```bash
# With tsx (fastest)
npm run test:dev

# Or compiled
npm test
```

Tests cover:

- Basic SET/GET/DEL operations (homework requirements)
- TTL passive and active expiration with batch delete
- ZSET operations (add, score, rank, range, remove)
- Score update behavior (remove + reinsert)
- Eviction (LRU and LFU) with dynamic pool sizing
- IntSet encoding and upgrade
- Iterator-based TTL sampling
- Usage tracking (LRU timestamps, LFU frequency counters)
- WRONGTYPE errors

### Run Load Test

```bash
# Start server in one terminal
npm run dev

# In another terminal (with tsx)
npm run load:dev

# Or compiled
npm run load
```

Load test performs:

- 5,000 SET operations
- 5,000 GET operations
- 2,000 ZADD operations
- 500 ZRANGEBYSCORE operations
- Reports throughput (ops/sec) for each

Example results (MacBook, Node.js v22):

- SET: ~28,000 ops/sec
- GET: ~45,000 ops/sec
- ZADD: ~50,000 ops/sec
- ZRANGEBYSCORE: ~50,000 ops/sec
- Overall: ~37,000 ops/sec

## Observability

The cache now includes built-in metrics for monitoring performance:

```typescript
const stats = cache.getStats();
console.log(stats);
// {
//   hits: 1000,
//   misses: 50,
//   evictions: 10,
//   expirations: 25,
//   operations: 1050,
//   keyCount: 500,
//   memoryUsed: 5242880,
//   hitRate: 0.952
// }
```

**Available metrics:**

- `hits`: Number of successful GET/ZSCORE/ZRANK operations
- `misses`: Number of failed lookups (key not found or expired)
- `evictions`: Number of keys evicted due to memory pressure
- `expirations`: Number of keys deleted due to TTL expiration
- `operations`: Total operations performed
- `keyCount`: Current number of keys in cache
- `memoryUsed`: Approximate memory usage in bytes
- `hitRate`: Cache hit rate (hits / (hits + misses))

## Project Structure

```
src/
├── core/
│   ├── Cache.ts          # Main cache with optimized eviction
│   ├── Dictionary.ts     # Incremental rehashing dictionary
│   └── index.ts
│
├── zset/
│   ├── ZSet.ts           # Sorted set implementation
│   ├── SkipList.ts       # Skiplist with rank tracking
│   ├── SkipListNode.ts   # Node structure
│   ├── utils.ts          # Helper functions
│   └── index.ts
│
├── encodings/
│   ├── IntSet.ts         # Compact integer set
│   ├── ListPackNode.ts   # Packed list node
│   ├── QuickList.ts      # Linked list of listpacks
│   └── index.ts
│
├── expiration/
│   ├── TTLManager.ts     # TTL tracking with active expiration
│   └── index.ts
│
├── eviction/
│   ├── UsageTracker.ts   # LRU/LFU tracking with metadata
│   └── index.ts
│
├── types/
│   └── index.ts          # Shared TypeScript types
│
└── server.ts             # HTTP server
```

## Architecture & Internals

### ZSET: Dual Index (Skiplist + Hash)

**Why dual index?**

- **Hash (Map)**: O(1) lookup by member, O(1) score retrieval
- **Skiplist**: O(log N) range queries by score, O(log N) rank calculation

**Why score updates require remove + reinsert:**

- Skiplist is ordered by `(score, member)` tuple
- Changing score changes position in skiplist
- Simply updating score in-place would break skiplist invariants
- Standard strategy used in sorted set implementations

**Skiplist details:**

- Random level generation (p=0.25, max level 32)
- `span` arrays track distance between nodes for O(log N) rank calculation
- `backward` pointers enable reverse traversal

**Implementation:** `src/zset/`

### TTL: Active + Passive + Lazy Expiration

**Passive expiration:**

- On key access, check if expired
- If expired, delete key immediately
- Zero overhead for keys that are never accessed

**Active expiration (background loop):**

- Every 200ms, sample 10 random TTL keys
- If >25% are expired, run another sampling round
- Max 2 rounds per cycle to prevent blocking
- Prevents memory leaks from never-accessed expired keys

**Lazy expiration (optimized):**

- Every 100 operations, purge 5 random expired keys
- Amortizes expiration cost across operations
- Lower overhead than pure active expiration

**Implementation:** `src/expiration/TTLManager.ts`

### Eviction: Optimized Pool-Based LRU/LFU

**Optimizations over basic sampling:**

- **Dynamic eviction pool**: Pool size adapts to key count (8-64 keys)
  - < 1,000 keys: pool size 8
  - < 10,000 keys: pool size 16
  - < 100,000 keys: pool size 32
  - ≥ 100,000 keys: pool size 64
- **Validation before delete**: Checks if key still exists (may have been deleted by TTL)
- **Batch sampling**: Sample 2x keys at once, sort by quality
- **Refill on empty**: Only resample when pool is depleted
- **Better selection**: Sort candidates by eviction quality before adding to pool

**LRU (Least Recently Used):**

- Track `lastAccess` timestamp per key
- Sort candidates by oldest access time

**LFU (Least Frequently Used):**

- 8-bit frequency counter per key (0-255)
- **Probabilistic increment**: `p = 1/(1 + freq)`, prevents saturation
- **Periodic decay**: every 60s, `freq = max(0, freq - 1)`, ages out old frequencies
- Sort candidates by lowest frequency (ties broken by LRU)

**Memory tracking:**

- Per-entry memory calculation for accurate accounting
- **Incremental updates**: Track deltas instead of full recalculation
  - ZADD: ~80 bytes per member added
  - ZREM: ~80 bytes per member removed
  - SADD: 8 bytes (intset) or 40 bytes (hashtable) per member
- Tracks string length, zset cardinality, set size
- Enables precise eviction decisions

**Implementation:** `src/core/Cache.ts:276-289, 295-315, 382-447`, `src/eviction/UsageTracker.ts`

### Incremental Rehash

**Concept:**

- Dictionary uses two hash tables: `ht[0]` (current) and `ht[1]` (new)
- During rehash: each operation migrates a few buckets from `ht[0]` to `ht[1`
- Spreads rehashing cost across many operations (avoids long pauses)
- Lookups check both tables; insertions go to `ht[1]`

**Our implementation:**

- Simulates the concept using JavaScript Maps (no explicit buckets)
- Each operation moves N entries before proceeding
- Demonstrates incremental rehash pattern

**Implementation:** `src/core/Dictionary.ts`

### Encodings (Memory Optimization)

**IntSet:**

- Compact sorted array for small all-integer sets
- Auto-upgrade to Set when:
  - Size exceeds threshold (default 512)
  - Non-integer value added
- Saves memory for common use cases (e.g., user IDs, timestamps)

**ListPack / QuickList:**

- ListPack: length-prefixed packed list in buffer (simplified sketch)
- QuickList: linked list of ListPack nodes for larger lists
- Auto-sizing based on element count and byte threshold

**Implementation:** `src/encodings/`

## Configuration

Cache options (in `src/server.ts`):

```typescript
const cache = new Cache({
  maxmemory: 10_000_000, // 10MB max memory
  evictionPolicy: "lfu", // 'lru' or 'lfu'
  evictionSampleSize: 8, // Number of keys to sample for eviction
});
```

## Scripts

```bash
# Development
npm run dev              # Run server with tsx (no build)
npm run test:dev         # Run tests with tsx
npm run test:homework    # Run homework tests (requires server running)
npm run load:dev         # Run load test with tsx

# Production
npm run build            # Compile TypeScript to dist/
npm start                # Build and run server
npm test                 # Build and run tests
npm run load             # Build and run load test
```

## Production Considerations

### Protocol & Transport

- **Current**: JSON over HTTP (easy to use, slower)
- **Production**: RESP (Redis Serialization Protocol) over TCP
  - Binary-safe
  - More efficient serialization
  - Pipelining support
  - Pub/sub capabilities

### Persistence

- **Snapshotting (RDB)**: Periodic full dumps to disk
- **Append-Only File (AOF)**: Log every write operation
- Hybrid: RDB + AOF for fast restarts with durability

### Clustering & Sharding

- **Replication**: Master-replica for read scaling
- **Sharding**: Partition keyspace across nodes (consistent hashing)

### Additional Data Structures

- **Hashes**: Field-value pairs under single key
- **Lists**: Doubly-linked list (LPUSH, RPOP, blocking operations)
- **Streams**: Append-only log with consumer groups
- **Bitmaps, HyperLogLog, Geospatial indexes**

### Further Optimizations

- **I/O multiplexing**: epoll/kqueue for efficient event loop
- **Single-threaded with I/O threads**: Main thread for commands, I/O threads for network
- **Copy-on-write**: Fork for background saves without blocking
- **Lazy freeing**: Async key deletion for large objects

### Observability (Already Implemented)

This project already includes:

- **`getStats()` method**: Returns hits, misses, evictions, expirations, operations, keyCount, memoryUsed, and hitRate
- See "Observability" section above for usage

Additional improvements for production:

- **Slow log**: Track commands exceeding latency threshold
- **INFO command**: Detailed runtime statistics and diagnostics
- **Metrics export**: Prometheus/StatsD integration

## License

MIT
