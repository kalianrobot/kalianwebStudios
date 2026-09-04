import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockCallable = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { ok: true } })));

vi.mock('../../src/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));

import { sendWelcomeEmail, sendMembershipUpdateEmail, sendCourseApprovalEmail, enviarCarnetDigital, subscribeNewsletter } from '../../src/lib/brevoService';

describe('brevoService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sendWelcomeEmail no manda enlace de activación: lo genera la CF', async () => {
    await sendWelcomeEmail('a@b.es', 'Ana');
    expect(mockCallable).toHaveBeenCalledWith({ email: 'a@b.es', nombre: 'Ana' });
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

  it('enviarCarnetDigital no manda datos: el socio sale del token', async () => {
    mockCallable.mockResolvedValueOnce({ data: { enviado: true } } as any);
    const res = await enviarCarnetDigital();
    expect(mockCallable).toHaveBeenCalledWith({});
    expect(res).toEqual({ enviado: true });
  });

  it('subscribeNewsletter devuelve el data de la CF', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ok: true, duplicate: false } } as any);
    const res = await subscribeNewsletter('Ana', 'a@b.es');
    expect(res).toEqual({ ok: true, duplicate: false });
  });
});
