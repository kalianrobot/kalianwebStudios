import type { AuditEntry } from './types.js';

export function createAuditEntry(
  params: Omit<AuditEntry, 'timestamp'>
): AuditEntry {
  return {
    ...params,
    timestamp: new Date(),
  };
}
