import { ulid } from 'ulid';

/** Generate a sortable unique identifier (ULID). Optional prefix for readability in mocks. */
export function newId(prefix?: string): string {
  const id = ulid();
  return prefix ? `${prefix}_${id}` : id;
}
