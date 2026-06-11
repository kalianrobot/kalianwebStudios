import { describe, it, expect } from 'vitest';
import { MASTER_EMAIL } from '../../src/lib/constants';

describe('constants', () => {
  it('MASTER_EMAIL es la cuenta maestra hardcoded', () => {
    expect(MASTER_EMAIL).toBe('kalianrobot@gmail.com');
  });
});
