/**
 * Generate random level for skiplist node using probabilistic approach.
 * Higher levels are exponentially less likely (geometric distribution).
 */
export function randomLevel(maxLevel: number = 32, probability: number = 0.25): number {
  let level = 1;
  while (Math.random() < probability && level < maxLevel) {
    level++;
  }
  return level;
}

/**
 * Compare two (score, member) pairs for skiplist ordering.
 * Primary sort by score, secondary sort by member lexicographically.
 */
export function compareScoreMember(
  score1: number,
  member1: string,
  score2: number,
  member2: string
): number {
  if (score1 !== score2) {
    return score1 - score2;
  }
  // Lexicographic comparison for members with same score
  return member1 < member2 ? -1 : member1 > member2 ? 1 : 0;
}