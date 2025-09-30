import { SkipListNode } from './SkipListNode.js';
import { randomLevel, compareScoreMember } from './utils.js';

/**
 * SkipList for ordered storage by (score, member).
 * Provides O(log N) insert, delete, and range queries.
 * Maintains 'span' arrays to compute rank in O(log N).
 */
export class SkipList {
  maxLevel: number;
  level: number;
  header: SkipListNode;
  tail: SkipListNode | null;
  length: number;

  constructor() {
    this.maxLevel = 32;
    this.level = 1;
    // Header node with max level
    this.header = new SkipListNode(-Infinity, '', this.maxLevel);
    this.tail = null;
    this.length = 0;
  }

  /**
   * Insert (score, member). Returns the new node.
   * Must be called only if the member doesn't already exist.
   */
  insert(score: number, member: string): SkipListNode {
    const update: (SkipListNode | null)[] = new Array(this.maxLevel).fill(null);
    const rank: number[] = new Array(this.maxLevel).fill(0);
    let x: SkipListNode = this.header;

    // Find insertion point and track ranks
    for (let i = this.level - 1; i >= 0; i--) {
      rank[i] = i === this.level - 1 ? 0 : rank[i + 1];
      while (x.forward[i] &&
             compareScoreMember(x.forward[i]!.score, x.forward[i]!.member, score, member) < 0) {
        rank[i] += x.span[i];
        x = x.forward[i]!;
      }
      update[i] = x;
    }

    const newLevel = randomLevel(this.maxLevel);
    if (newLevel > this.level) {
      for (let i = this.level; i < newLevel; i++) {
        rank[i] = 0;
        update[i] = this.header;
        update[i]!.span[i] = this.length;
      }
      this.level = newLevel;
    }

    const newNode = new SkipListNode(score, member, newLevel);

    // Insert node and update spans
    for (let i = 0; i < newLevel; i++) {
      newNode.forward[i] = update[i]!.forward[i];
      update[i]!.forward[i] = newNode;

      // Update span: distance from update[i] to newNode + distance from newNode to next
      newNode.span[i] = update[i]!.span[i] - (rank[0] - rank[i]);
      update[i]!.span[i] = (rank[0] - rank[i]) + 1;
    }

    // Increment span for levels not touched
    for (let i = newLevel; i < this.level; i++) {
      update[i]!.span[i]++;
    }

    // Update backward pointer
    newNode.backward = update[0] === this.header ? null : update[0];
    if (newNode.forward[0]) {
      newNode.forward[0].backward = newNode;
    } else {
      this.tail = newNode;
    }

    this.length++;
    return newNode;
  }

  /**
   * Delete node with (score, member). Returns true if found and deleted.
   */
  delete(score: number, member: string): boolean {
    const update: (SkipListNode | null)[] = new Array(this.maxLevel).fill(null);
    let x: SkipListNode = this.header;

    // Find the node to delete
    for (let i = this.level - 1; i >= 0; i--) {
      while (x.forward[i] &&
             compareScoreMember(x.forward[i]!.score, x.forward[i]!.member, score, member) < 0) {
        x = x.forward[i]!;
      }
      update[i] = x;
    }

    x = x.forward[0]!;
    if (!x || x.score !== score || x.member !== member) {
      return false;  // Not found
    }

    // Remove node and update spans
    for (let i = 0; i < this.level; i++) {
      if (update[i]!.forward[i] === x) {
        update[i]!.span[i] += x.span[i] - 1;
        update[i]!.forward[i] = x.forward[i];
      } else {
        update[i]!.span[i]--;
      }
    }

    // Update backward pointer
    if (x.forward[0]) {
      x.forward[0].backward = x.backward;
    } else {
      this.tail = x.backward;
    }

    // Adjust skiplist level if needed
    while (this.level > 1 && !this.header.forward[this.level - 1]) {
      this.level--;
    }

    this.length--;
    return true;
  }

  /**
   * Get rank (0-based) of (score, member). Returns -1 if not found.
   */
  getRank(score: number, member: string): number {
    let rank = 0;
    let x: SkipListNode = this.header;

    for (let i = this.level - 1; i >= 0; i--) {
      while (x.forward[i] &&
             compareScoreMember(x.forward[i]!.score, x.forward[i]!.member, score, member) <= 0) {
        rank += x.span[i];
        x = x.forward[i]!;
        if (x.score === score && x.member === member) {
          return rank - 1;  // 0-based rank
        }
      }
    }
    return -1;
  }

  /**
   * Get all nodes in score range [min, max], up to limit entries.
   * Returns array of [member, score] pairs.
   */
  getByScoreRange(min: number, max: number, limit: number = Infinity): [string, number][] {
    const result: [string, number][] = [];
    let x: SkipListNode | null = this.header.forward[0];

    // Skip to first node >= min
    while (x && x.score < min) {
      x = x.forward[0];
    }

    // Collect nodes in range
    while (x && x.score <= max && result.length < limit) {
      result.push([x.member, x.score]);
      x = x.forward[0];
    }

    return result;
  }
}