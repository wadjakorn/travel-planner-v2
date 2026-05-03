'use server';

import { signIn, signOut } from '@/lib/auth';

export async function signInGoogleAction() {
  await signIn('google', { redirectTo: '/' });
}

export async function signOutAction() {
  await signOut({ redirectTo: '/sign-in' });
}
