import { describe, it, expect } from 'vitest';
import { saveLeg, type LegSaveInput } from './leg-save';

const bad = (i: unknown) => saveLeg('u', i as LegSaveInput);

describe('saveLeg input validation', () => {
  it('rejects non-object input', async () => {
    await expect(bad(null)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(bad('x')).rejects.toMatchObject({ code: 'bad_request' });
  });
  it('rejects unknown target', async () => {
    await expect(bad({ target: 'nope' })).rejects.toMatchObject({ code: 'bad_request' });
  });
  it('rejects unknown hotel leg', async () => {
    await expect(
      bad({ target: 'hotel', hotelId: 'h', leg: 'sideways', mode: 'walk' }),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });
});
