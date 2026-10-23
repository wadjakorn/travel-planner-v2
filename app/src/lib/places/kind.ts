import type { Kind } from './types';

export function kindFromCategories(cats: readonly string[]): Kind {
  const has = (root: string) => cats.some((c) => c === root || c.startsWith(`${root}.`));
  if (has('accommodation')) return 'hotel';
  if (has('catering')) return 'food';
  if (has('airport') || has('public_transport')) return 'transit';
  return 'sight';
}

const HOTEL = new Set(['hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'resort', 'chalet']);
const FOOD = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'ice_cream', 'bakery']);
const TRANSIT_KEYS = new Set(['aeroway', 'railway', 'public_transport']);
const TRANSIT_VALUES = new Set(['aerodrome', 'terminal', 'station', 'halt', 'bus_station', 'ferry_terminal']);

export function kindFromOsm(key?: string, value?: string): Kind {
  if (!key || !value) return 'sight';
  if (key === 'tourism' && HOTEL.has(value)) return 'hotel';
  if ((key === 'amenity' || key === 'shop') && FOOD.has(value)) return 'food';
  if (TRANSIT_VALUES.has(value) && (TRANSIT_KEYS.has(key) || key === 'amenity')) return 'transit';
  return 'sight';
}

const G_FOOD = ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'meal_delivery', 'food'];
const G_TRANSIT = ['transit_station', 'subway_station', 'train_station', 'bus_station', 'airport', 'light_rail_station'];

export function kindFromGoogleTypes(types: readonly string[] | undefined): Kind {
  if (!types) return 'sight';
  if (types.includes('lodging')) return 'hotel';
  if (G_FOOD.some((t) => types.includes(t))) return 'food';
  if (G_TRANSIT.some((t) => types.includes(t))) return 'transit';
  return 'sight';
}
