import { describe, it, expect } from 'vitest';
import en from '@/messages/en.json';
import { bookingsEmptyKeys, type BookingFilter } from './booking-format';

describe('bookingsEmptyKeys', () => {
  it.each([
    ['all', 'No bookings yet', 'Add a stay or transport — once it has a date, it shows on your itinerary and map.'],
    ['stay', 'No stays yet', 'Add a stay — once it has dates, it shows on your itinerary and map.'],
    ['move', 'No transport yet', 'Add a flight, train, car or ferry — once it has a date, it shows on your itinerary.'],
  ])('%s', (f, title, body) => {
    const k = bookingsEmptyKeys(f as BookingFilter);
    expect({ title: en[k.title], body: en[k.body] }).toEqual({ title, body });
  });
});
