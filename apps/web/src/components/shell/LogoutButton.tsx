'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

export function LogoutButton() {
  // Disabled until hydrated, so a click on the server-rendered button is never lost.
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setReady(true), []);

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // An expired session is already logged out; go to /login regardless.
    }
    // Full page load discards the client router cache, so no signed-in page
    // data survives logout (a soft router navigation raced the cookie change).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  }

  return (
    <Button variant="secondary" onClick={logout} disabled={!ready || busy}>
      {busy ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
