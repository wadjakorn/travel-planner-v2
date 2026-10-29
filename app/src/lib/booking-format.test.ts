import { describe, it, expect } from 'vitest';
import { bookingsEmptyCopy, type BookingFilter } from './booking-format';

describe('bookingsEmptyCopy', () => {
  it.each([
    ['all', 'No bookings yet', 'Add a stay or transport — once it has a date, it shows on your itinerary and map.'],
    ['stay', 'No stays yet', 'Add a stay — once it has dates, it shows on your itinerary and map.'],
    ['move', 'No transport yet', 'Add a flight, train, car or ferry — once it has a date, it shows on your itinerary.'],
  ])('%s', (f, title, body) => expect(bookingsEmptyCopy(f as BookingFilter)).toEqual({ title, body }));
});
