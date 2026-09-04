import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockCallable = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { ok: true } })));

vi.mock('../../src/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));

import { sendWelcomeEmail, sendMembershipUpdateEmail, sendCourseApprovalEmail, subscribeNewsletter } from '../../src/lib/brevoService';

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

  it('sendCourseApprovalEmail solo manda el id de la solicitud', async () => {
    await sendCourseApprovalEmail('sol123');
    expect(mockCallable).toHaveBeenCalledWith({ solicitudId: 'sol123' });
  });

  it('subscribeNewsletter devuelve el data de la CF', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ok: true, duplicate: false } } as any);
    const res = await subscribeNewsletter('Ana', 'a@b.es');
    expect(res).toEqual({ ok: true, duplicate: false });
  });
});
