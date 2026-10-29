// Guards on the booking-delete Undo (TP-0091). The DB is a stub: these lock
// the ORDER of checks — authz before anything is revealed or written, and no
// write unless the row is soft-deleted inside the window.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  selectRows: [] as Array<{ tripId: string; deletedAt: Date | null }>,
  updateRows: [] as Array<{ id: string }>,
  updates: [] as unknown[],
  requireTripAccess: vi.fn(),
  touchTrip: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => h.selectRows }) }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: () => ({
          returning: async () => {
            h.updates.push(values);
            return h.updateRows;
          },
        }),
      }),
    }),
  },
}));
vi.mock('./access', () => ({ requireTripAccess: h.requireTripAccess }));
vi.mock('@/lib/touch-trip', () => ({ touchTrip: h.touchTrip }));
vi.mock('@/lib/audit', () => ({ writeAudit: h.writeAudit }));

import { restoreHotel, restoreTransport } from './booking-service';
import { ServiceError } from './service-error';

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000);

beforeEach(() => {
  h.selectRows = [];
  h.updateRows = [{ id: 'b1' }];
  h.updates = [];
  h.requireTripAccess.mockReset().mockResolvedValue('editor');
  h.touchTrip.mockReset();
  h.writeAudit.mockReset();
});

describe.each([
  ['hotel', restoreHotel],
  ['transport', restoreTransport],
] as const)('restore %s', (entityType, restore) => {
  it('clears deletedAt on the booking trip after a write check', async () => {
    h.selectRows = [{ tripId: 't1', deletedAt: secondsAgo(30) }];
    await expect(restore('u1', 'b1')).resolves.toEqual({ tripId: 't1' });
    expect(h.requireTripAccess).toHaveBeenCalledWith('u1', 't1', 'write');
    expect(h.updates).toEqual([{ deletedAt: null }]);
    expect(h.touchTrip).toHaveBeenCalledWith('t1');
    expect(h.writeAudit).toHaveBeenCalledWith({
      tripId: 't1',
      userId: 'u1',
      action: 'update',
      entityType,
      entityId: 'b1',
      after: { restored: true },
    });
  });

  it('refuses an unknown booking without writing', async () => {
    await expect(restore('u1', 'missing')).rejects.toMatchObject({ code: 'not_found' });
    expect(h.requireTripAccess).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
  });

  it('refuses a user without write access before revealing the delete state', async () => {
    h.selectRows = [{ tripId: 't1', deletedAt: null }];
    h.requireTripAccess.mockRejectedValue(new ServiceError('forbidden', 'You do not have edit access'));
    await expect(restore('viewer', 'b1')).rejects.toMatchObject({ code: 'forbidden' });
    expect(h.updates).toEqual([]);
  });

  it('refuses a booking that is not deleted', async () => {
    h.selectRows = [{ tripId: 't1', deletedAt: null }];
    await expect(restore('u1', 'b1')).rejects.toMatchObject({ code: 'not_found' });
    expect(h.updates).toEqual([]);
  });

  it('refuses a delete older than the window', async () => {
    h.selectRows = [{ tripId: 't1', deletedAt: secondsAgo(11 * 60) }];
    await expect(restore('u1', 'b1')).rejects.toMatchObject({ code: 'not_found' });
    expect(h.updates).toEqual([]);
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it('refuses when a concurrent undo already restored it', async () => {
    h.selectRows = [{ tripId: 't1', deletedAt: secondsAgo(5) }];
    h.updateRows = [];
    await expect(restore('u1', 'b1')).rejects.toMatchObject({ code: 'not_found' });
    expect(h.touchTrip).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});
