/**
 * Encodings / Representations
 *
 * We use compact encodings for small data structures, upgrading to more
 * general structures when thresholds are exceeded. This saves memory.
 *
 * Implemented here:
 * - IntSet: compact array for small all-integer sets (auto-upgrade to Set)
 * - ListPack: length-prefixed packed list (sketch)
 * - QuickList: linked list of listpacks for larger lists
 */

export { IntSet } from './IntSet.js';
export { ListPackNode } from './ListPackNode.js';
export { QuickList, createList } from './QuickList.js';