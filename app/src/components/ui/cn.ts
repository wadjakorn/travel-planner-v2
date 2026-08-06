// Class joiner for the design system. Uses tailwind-merge so a caller's
// className deterministically overrides a primitive's base classes on the
// same property — with a plain join, the winner came down to the order
// Tailwind happened to emit its utilities, which made `<Button className>`
// a coin flip for anything that set padding, radius or height.
import { twMerge } from 'tailwind-merge';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '));
}
