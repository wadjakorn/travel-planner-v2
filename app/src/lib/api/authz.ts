// Trip access resolution for API routes. Re-exported from the services
// layer so routes and services share one implementation.

export { requireTripAccess, type AccessNeed } from '@/lib/services/access';
