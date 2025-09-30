import { ListPackNode } from './ListPackNode.js';

interface QuickListNode {
  data: ListPackNode;
  next: QuickListNode | null;
  prev: QuickListNode | null;
}

/**
 * QuickList - Linked list of ListPack nodes
 * Used for lists that grow beyond single listpack size
 *
 * In production implementations:
 * - Doubly-linked list of ziplist/listpack nodes
 * - Allows efficient push/pop at both ends
 * - Middle insertions may require node splitting
 * - Compress middle nodes (LZF) to save memory
 */
export class QuickList {
  private head: QuickListNode | null;
  private tail: QuickListNode | null;
  private length: number;

  constructor() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  /**
   * Append element to end of list
   */
  rpush(value: any): void {
    if (!this.tail || !this.tail.data.tryAppend(value)) {
      // Need new node
      const node: QuickListNode = {
        data: new ListPackNode(),
        next: null,
        prev: this.tail
      };
      node.data.tryAppend(value);

      if (this.tail) {
        this.tail.next = node;
      } else {
        this.head = node;
      }
      this.tail = node;
    }
    this.length++;
  }

  /**
   * Prepend element to start of list
   */
  lpush(value: any): void {
    // For simplicity, always create new node at head
    // Production version would try to prepend to existing head node
    const node: QuickListNode = {
      data: new ListPackNode(),
      next: this.head,
      prev: null
    };
    node.data.tryAppend(value);

    if (this.head) {
      this.head.prev = node;
    } else {
      this.tail = node;
    }
    this.head = node;
    this.length++;
  }

  /**
   * Get element at index (0-based)
   */
  get(index: number): any {
    if (index < 0 || index >= this.length) {
      return undefined;
    }

    let current = this.head;
    let offset = 0;

    while (current) {
      if (offset + current.data.length > index) {
        return current.data.get(index - offset);
      }
      offset += current.data.length;
      current = current.next;
    }

    return undefined;
  }

  /**
   * Get all elements as array
   */
  toArray(): any[] {
    const result: any[] = [];
    let current = this.head;
    while (current) {
      result.push(...current.data.toArray());
      current = current.next;
    }
    return result;
  }

  /**
   * Get number of elements
   */
  get size(): number {
    return this.length;
  }
}

/**
 * Helper: Create appropriate list structure based on size hint
 */
export function createList(_sizeHint: number = 0): QuickList {
  // Start with quicklist (in production, might start with single listpack)
  return new QuickList();
}