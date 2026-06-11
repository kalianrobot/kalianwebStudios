import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockCallable = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { ok: true } })));

vi.mock('../../src/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));

import { sendWelcomeEmail, sendMembershipUpdateEmail, subscribeNewsletter } from '../../src/lib/brevoService';

describe('brevoService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sendWelcomeEmail pasa los parámetros a la callable', async () => {
    await sendWelcomeEmail('a@b.es', 'Ana', 'http://reset');
    expect(mockCallable).toHaveBeenCalledWith({ email: 'a@b.es', nombre: 'Ana', activationLink: 'http://reset' });
  });

  it('sendMembershipUpdateEmail pasa membresias', async () => {
    await sendMembershipUpdateEmail('a@b.es', 'Ana', 'uid1', { curso: '2026-12-31' });
    expect(mockCallable).toHaveBeenCalledWith({
      email: 'a@b.es', nombre: 'Ana', uid: 'uid1', membresias: { curso: '2026-12-31' },
    });
  });

  it('subscribeNewsletter devuelve el data de la CF', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ok: true, duplicate: false } });
    const res = await subscribeNewsletter('Ana', 'a@b.es');
    expect(res).toEqual({ ok: true, duplicate: false });
  });
});
