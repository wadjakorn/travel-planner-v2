import { describe, it, expect } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';

type K = keyof typeof en;

describe('messages en/th', () => {
  it('th has exactly the en keys', () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it('no empty values', () => {
    for (const d of [en, th]) for (const [k, v] of Object.entries(d)) expect(v, k).not.toBe('');
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
    for (const [a, b] of pairs) expect(th[a], `${a} vs ${b}`).not.toBe(th[b]);
  });
});
