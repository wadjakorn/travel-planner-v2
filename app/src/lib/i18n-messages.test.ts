import { describe, it, expect } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import { placeholders } from '@/lib/i18n-client';

type K = keyof typeof en;

describe('messages en/th', () => {
  it('th has exactly the en keys', () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it('no empty values', () => {
    for (const d of [en, th]) for (const [k, v] of Object.entries(d)) expect(v, k).not.toBe('');
  });

  it('th keeps every {placeholder} of en (and adds none)', () => {
    for (const k of Object.keys(en) as K[]) expect(placeholders(th[k]), k).toEqual(placeholders(en[k]));
  });

  it('plural keys come in _one/_other pairs', () => {
    for (const k of Object.keys(en)) {
      if (k.endsWith('_one')) expect(en, k).toHaveProperty(k.replace(/_one$/, '_other'));
      // English n=1 reads _one: an _other alone would render the raw key.
      if (k.endsWith('_other')) expect(en, k).toHaveProperty(k.replace(/_other$/, '_one'));
    }
  });

  it('glossary terms (th)', () => {
    expect(th.notes).toBe('โน้ต');
    expect(th.hotels).toBe('ที่พัก');
    expect(th.transport).toBe('การเดินทาง');
    expect(th.itinerary).toBe('แผนเที่ยว');
  });

  it('distinct meanings never share a Thai word', () => {
    const pairs: [K, K][] = [
      ['notes', 'save'],
      ['itinerary', 'transport'],
      ['hotels', 'bookings'],
    ];
    // Containment, not just equality: "บันทึกโน้ต" would still read as Save.
    for (const [a, b] of pairs) {
      expect(th[a].includes(th[b]), `${a} contains ${b}`).toBe(false);
      expect(th[b].includes(th[a]), `${b} contains ${a}`).toBe(false);
    }
    // The old itinerary word (แผนเดินทาง) shared the transport root with การเดินทาง.
    expect(th.itinerary).not.toContain('เดินทาง');
  });
});
