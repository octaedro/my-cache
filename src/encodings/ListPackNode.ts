/**
 * ListPack Node - A packed list in a buffer
 * Simplified sketch: stores elements as length-prefixed strings
 *
 * In production implementations:
 * - Uses variable-length encoding for integers and strings
 * - Stores total bytes, element count, and can traverse backward
 * - Max size ~4-8KB before splitting into new node
 */
export class ListPackNode {
  elements: any[];
  bytes: number;
  maxBytes: number;

  constructor(maxBytes: number = 4096) {
    this.elements = [];
    this.bytes = 0;
    this.maxBytes = maxBytes;
  }

  /**
   * Try to append element. Returns false if would exceed maxBytes.
   */
  tryAppend(value: any): boolean {
    const encoded = String(value);
    const size = encoded.length + 4;  // Simplified: 4 bytes for length prefix

    if (this.bytes + size > this.maxBytes && this.elements.length > 0) {
      return false;  // Would exceed max size
    }

    this.elements.push(value);
    this.bytes += size;
    return true;
  }

  get(index: number): any {
    return this.elements[index];
  }

  get length(): number {
    return this.elements.length;
  }

  toArray(): any[] {
    return [...this.elements];
  }
}