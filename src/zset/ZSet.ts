import { SkipList } from './SkipList.js';

/**
 * ZSET (Sorted Set) implementation with dual index:
 * 1. Hash (Map): member -> score for O(1) lookup by member
 * 2. SkipList: ordered by (score, member) for O(log N) range queries and rank
 *
 * Score updates require remove + reinsert in skiplist because:
 * - Skiplist order is (score, member), so changing score changes position
 * - Simply updating score in-place would break skiplist invariants
 * - This is the standard strategy used in sorted set implementations
 */
export class ZSet {
  private dict: Map<string, number>;
  private skiplist: SkipList;

  constructor() {
    this.dict = new Map();
    this.skiplist = new SkipList();
  }

  /**
   * Add member with score. Returns true if new member added, false if updated.
   */
  zadd(member: string, score: number): boolean {
    const existing = this.dict.get(member);

    if (existing !== undefined) {
      if (existing === score) {
        return false;  // No change
      }
      // Score changed: must remove old entry from skiplist and reinsert
      // This is necessary because skiplist is ordered by (score, member)
      this.skiplist.delete(existing, member);
      this.skiplist.insert(score, member);
      this.dict.set(member, score);
      return false;
    }

    // New member
    this.skiplist.insert(score, member);
    this.dict.set(member, score);
    return true;
  }

  /**
   * Remove member. Returns true if removed, false if not found.
   */
  zrem(member: string): boolean {
    const score = this.dict.get(member);
    if (score === undefined) {
      return false;
    }
    this.skiplist.delete(score, member);
    this.dict.delete(member);
    return true;
  }

  /**
   * Get score of member. Returns null if not found.
   */
  zscore(member: string): number | null {
    const score = this.dict.get(member);
    return score !== undefined ? score : null;
  }

  /**
   * Get 0-based rank of member. Returns null if not found.
   */
  zrank(member: string): number | null {
    const score = this.dict.get(member);
    if (score === undefined) {
      return null;
    }
    return this.skiplist.getRank(score, member);
  }

  /**
   * Get members with scores in range [min, max], up to limit entries.
   * Returns array of [member, score] pairs.
   */
  zrangeByScore(min: number, max: number, limit?: number): [string, number][] {
    return this.skiplist.getByScoreRange(min, max, limit);
  }

  /**
   * Get number of members.
   */
  zcard(): number {
    return this.dict.size;
  }
}