// Demo "Mount Fuji & Kamakura" seed: itinerary days/places/segments
// + hotel + transport bookings.
//
// Day-by-day itinerary data lives in ./seed/days.ts to keep this file scannable.

import type {
  NewDay,
  NewPlace,
  NewSegment,
  NewHotelBooking,
  NewTransportBooking,
  NewExpense,
  NewNote,
  NewChecklistItem,
} from '@/db/schema';
import { SEED_DAYS } from './seed/days';

export type SeedDay = Omit<NewDay, 'id' | 'tripId'> & {
  places: Array<Omit<NewPlace, 'id' | 'dayId'>>;
  segments: Array<Omit<NewSegment, 'id' | 'dayId'>>;
};

export type SeedHotel = Omit<NewHotelBooking, 'id' | 'tripId'>;
export type SeedTransport = Omit<NewTransportBooking, 'id' | 'tripId'>;
export type SeedExpense = Omit<NewExpense, 'id' | 'tripId' | 'paidBy'>;
export type SeedNote = Omit<NewNote, 'id' | 'tripId'> & {
  items?: Array<Omit<NewChecklistItem, 'id' | 'noteId'>>;
};

export const SEED_TRIP = {
  title: 'Mount Fuji & Kamakura',
  subtitle: 'Tokyo · Hakone · Kamakura',
  startDate: '2026-04-12',
  endDate: '2026-04-16',
  cover: 'fuji',
  collaborators: [
    { initials: 'AY', color: '#0071e3' },
    { initials: 'MK', color: '#5b3fd9' },
    { initials: 'TS', color: '#29a847' },
  ],
  recco: [
    { name: 'Fuji-Q Highland', sub: 'Theme park · 12 km', color: '#ffd6a5' },
    { name: 'Iyashi no Sato', sub: 'Heritage village · 8 km', color: '#a5d8ff' },
    { name: 'Aokigahara Forest', sub: 'Hiking · 14 km', color: '#b2f2bb' },
    { name: 'Saiko Bat Cave', sub: 'Cave tour · 11 km', color: '#d0bfff' },
  ],
  days: SEED_DAYS,

  hotels: [
    {
      dayIdx: 0,
      name: 'Park Hotel Tokyo',
      address: '1-7-1 Higashi-Shimbashi, Minato, Tokyo',
      checkInDate: 'Apr 12, 2026', checkInTime: '3:00 PM',
      checkOutDate: 'Apr 13, 2026', checkOutTime: '11:00 AM',
      nights: 1, room: 'King · Artist Floor 31F', guests: 2,
      ref: 'PHT-29481', costAmount: 380, costCurrency: 'USD',
      cancellation: 'Free until Apr 10', contact: '+81 3-6252-1111',
      notes: 'Late check-in available. Request high floor.',
      attachmentName: 'Park_Hotel_voucher.pdf', attachmentSize: '184 KB',
      thumb: '#dcd0ff',
    },
    {
      dayIdx: 1,
      name: 'Hoshinoya Fuji',
      address: '1408 Oishi, Fujikawaguchiko, Yamanashi',
      checkInDate: 'Apr 13, 2026', checkInTime: '3:00 PM',
      checkOutDate: 'Apr 14, 2026', checkOutTime: '12:00 PM',
      nights: 1, room: 'Cabin Suite · Lake-facing', guests: 2,
      ref: 'HFY-77231', costAmount: 720, costCurrency: 'USD',
      cancellation: 'Free until Apr 11', contact: '+81 50-3134-8091',
      notes: 'Glamping resort. Dinner included.',
      attachmentName: 'Hoshinoya_confirmation.pdf', attachmentSize: '212 KB',
      thumb: '#cde8c4',
    },
    {
      dayIdx: 2,
      name: 'Hakone Yumoto Onsen Tenseien',
      address: '682 Yumoto, Hakone, Kanagawa',
      checkInDate: 'Apr 14, 2026', checkInTime: '3:00 PM',
      checkOutDate: 'Apr 15, 2026', checkOutTime: '10:00 AM',
      nights: 1, room: 'Japanese Suite w/ private onsen', guests: 2,
      ref: 'TSN-9920', costAmount: 540, costCurrency: 'USD',
      cancellation: 'Non-refundable', contact: '+81 460-85-5555',
      notes: 'Kaiseki dinner at 7pm. Yukata provided.',
      attachmentName: 'Tenseien_eVoucher.pdf', attachmentSize: '156 KB',
      thumb: '#cdd9e8',
    },
    {
      dayIdx: 3,
      name: 'Park Hotel Tokyo',
      address: '1-7-1 Higashi-Shimbashi, Minato, Tokyo',
      checkInDate: 'Apr 15, 2026', checkInTime: '3:00 PM',
      checkOutDate: 'Apr 16, 2026', checkOutTime: '11:00 AM',
      nights: 1, room: 'King · Artist Floor 31F', guests: 2,
      ref: 'PHT-29482', costAmount: 380, costCurrency: 'USD',
      cancellation: 'Free until Apr 13', contact: '+81 3-6252-1111',
      notes: 'Same room as Day 1. Final night.',
      attachmentName: 'Park_Hotel_voucher_2.pdf', attachmentSize: '184 KB',
      thumb: '#dcd0ff',
    },
  ] as SeedHotel[],

  transport: [
    {
      dayIdx: 0, type: 'flight',
      title: 'JL5 · Los Angeles → Tokyo', provider: 'Japan Airlines',
      ref: 'JL-LAX-NRT-7821',
      fromCode: 'LAX', fromName: 'Los Angeles Intl',
      fromTime: '11:45 AM', fromDate: 'Apr 11, 2026', fromTerminal: 'B',
      toCode: 'NRT', toName: 'Narita Intl',
      toTime: '3:50 PM', toDate: 'Apr 12, 2026', toTerminal: '1',
      duration: '11h 35m', seats: '14A, 14B · Economy', bag: '2 × 23kg checked',
      costAmount: 2480, costCurrency: 'USD',
      attachmentName: 'JL5_eTicket.pdf', attachmentSize: '92 KB',
    },
    {
      dayIdx: 2, type: 'train',
      title: 'Shinkansen · Tokyo → Odawara', provider: 'JR East',
      ref: 'JR-TKY-ODW-440',
      fromCode: 'TKY', fromName: 'Tokyo Sta.',
      fromTime: '9:15 AM', fromDate: 'Apr 14, 2026', fromTerminal: 'Track 14',
      toCode: 'ODW', toName: 'Odawara Sta.',
      toTime: '9:51 AM', toDate: 'Apr 14, 2026', toTerminal: 'Track 11',
      duration: '36m', seats: 'Car 7 · 12A, 12B · Reserved', bag: 'Carry-on',
      costAmount: 76, costCurrency: 'USD',
      attachmentName: 'JR_Pass_voucher.pdf', attachmentSize: '45 KB',
    },
    {
      dayIdx: 1, type: 'car',
      title: 'Toyota Prius · 3-day rental', provider: 'Times Car Rental',
      ref: 'TCR-FUJI-2204',
      fromCode: 'FUJI', fromName: 'Kawaguchiko Sta.',
      fromTime: '10:00 AM', fromDate: 'Apr 13, 2026', fromTerminal: 'Pickup B',
      toCode: 'FUJI', toName: 'Kawaguchiko Sta.',
      toTime: '9:00 AM', toDate: 'Apr 14, 2026', toTerminal: 'Return',
      duration: '1 day', seats: 'Compact · Hybrid · ETC card', bag: '—',
      costAmount: 88, costCurrency: 'USD',
      attachmentName: 'Times_rental_agreement.pdf', attachmentSize: '112 KB',
    },
    {
      dayIdx: 4, type: 'flight',
      title: 'JL62 · Tokyo → Los Angeles', provider: 'Japan Airlines',
      ref: 'JL-NRT-LAX-7821',
      fromCode: 'NRT', fromName: 'Narita Intl',
      fromTime: '4:20 PM', fromDate: 'Apr 16, 2026', fromTerminal: '1',
      toCode: 'LAX', toName: 'Los Angeles Intl',
      toTime: '10:45 AM', toDate: 'Apr 16, 2026', toTerminal: 'B',
      duration: '10h 25m', seats: '22F, 22G · Economy', bag: '2 × 23kg checked',
      costAmount: 2480, costCurrency: 'USD',
      attachmentName: 'JL62_eTicket.pdf', attachmentSize: '94 KB',
    },
  ] as SeedTransport[],

  expenses: [
    { dayIdx: 0, category: 'hotels', label: 'Park Hotel · Night 1', amount: 380, currency: 'USD', at: new Date('2026-04-12') },
    { dayIdx: 0, category: 'food', label: 'Sushi Saito dinner', amount: 240, currency: 'USD', at: new Date('2026-04-12') },
    { dayIdx: 0, category: 'transport', label: 'Taxi Shibuya', amount: 28, currency: 'USD', at: new Date('2026-04-12') },
    { dayIdx: 1, category: 'transport', label: 'Car rental · Times', amount: 88, currency: 'USD', at: new Date('2026-04-13') },
    { dayIdx: 1, category: 'food', label: 'Hoto Fudo lunch', amount: 32, currency: 'USD', at: new Date('2026-04-13') },
    { dayIdx: 1, category: 'activities', label: 'Lake Kawaguchi cruise', amount: 14, currency: 'USD', at: new Date('2026-04-13') },
    { dayIdx: 2, category: 'hotels', label: 'Hakone Tenseien · Night 1', amount: 540, currency: 'USD', at: new Date('2026-04-14') },
    { dayIdx: 2, category: 'food', label: 'Itoh Dining wagyu', amount: 268, currency: 'USD', at: new Date('2026-04-14') },
    { dayIdx: 3, category: 'shopping', label: 'Komachi Dori souvenirs', amount: 95, currency: 'USD', at: new Date('2026-04-15') },
    { dayIdx: 3, category: 'activities', label: 'Hasedera entry', amount: 8, currency: 'USD', at: new Date('2026-04-15') },
    { dayIdx: 4, category: 'food', label: 'Tsukiji breakfast', amount: 38, currency: 'USD', at: new Date('2026-04-16') },
  ] as SeedExpense[],

  notes: [
    {
      idx: 0,
      kind: 'checklist',
      title: 'Packing list',
      body: null,
      items: [
        { idx: 0, text: 'Passport + JR Pass voucher', done: true },
        { idx: 1, text: 'Universal adapter (Type A)', done: true },
        { idx: 2, text: 'Comfortable walking shoes', done: true },
        { idx: 3, text: 'Light rain jacket', done: false },
        { idx: 4, text: 'Yen cash (¥30,000)', done: false },
        { idx: 5, text: 'Camera + extra batteries', done: false },
      ],
    },
    {
      idx: 1,
      kind: 'checklist',
      title: 'Restaurant reservations',
      body: null,
      items: [
        { idx: 0, text: 'Sushi Saito · Apr 12, 7pm (confirmed)', done: true },
        { idx: 1, text: 'Narisawa · Apr 15, 6:30pm — needs deposit', done: false },
        { idx: 2, text: 'Tofuya Ukai · Apr 16 lunch', done: false },
      ],
    },
    {
      idx: 2,
      kind: 'doc',
      title: 'Things to see in Hakone',
      body: 'The open-air museum is the must-do. Allow 2-3 hours. Hakone Shrine and Lake Ashi cruise are the classic combo. Onsen etiquette: tattoos are still tricky in older spots — Tenseien is tattoo-friendly.',
    },
    {
      idx: 3,
      kind: 'doc',
      title: 'Phrases to know',
      body: "Sumimasen (excuse me) · Arigatou gozaimasu (thank you) · O-cha kudasai (tea please) · Omakase de (chef's choice).",
    },
  ] as SeedNote[],
};
