import { ItinerarySkeleton } from '@/components/skeletons';

// The trip layout keeps Header, TripRail and the map mounted; this only
// stands in for the itinerary column.
export default function TripLoading() {
  return <ItinerarySkeleton />;
}
