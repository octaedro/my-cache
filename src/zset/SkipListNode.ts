/**
 * SkipList Node
 * Each node stores a score and member, with forward pointers at multiple levels.
 * 'span' tracks how many nodes are skipped at each level (for rank calculation).
 */
export class SkipListNode {
  score: number;
  member: string;
  level: number;
  forward: (SkipListNode | null)[];
  span: number[];
  backward: SkipListNode | null;

  constructor(score: number, member: string, level: number) {
    this.score = score;
    this.member = member;
    this.level = level;
    this.forward = new Array(level).fill(null);
    this.span = new Array(level).fill(0);
    this.backward = null;
  }
}