import { describe, expect, it } from 'vitest';

import { resolveServerUrl, serverConfigured, type ServerLocation } from './OnlineClient';

const at = (hostname: string, protocol = 'https:', search = ''): ServerLocation => ({
  hostname,
  protocol,
  search,
});

// These rules decide what "Create room" does on a deployed static client. The Vercel
// build has no VITE_MULTIPLAYER_URL (vitest leaves it undefined too), so the cases below
// exercise the same-host fallback and the explicit override paths.
describe('multiplayer server resolution', () => {
  it('treats local development hosts as configured (same-host default server)', () => {
    expect(serverConfigured(at('localhost', 'http:'))).toBe(true);
    expect(serverConfigured(at('127.0.0.1', 'http:'))).toBe(true);
    expect(resolveServerUrl(at('127.0.0.1', 'http:'))).toBe('ws://127.0.0.1:8090/');
  });

  it('reports a deployed static client with no server as unconfigured', () => {
    const vercel = at('arc-armour.vercel.app');
    expect(serverConfigured(vercel)).toBe(false);
    // The fallback still resolves to a definite address so the error can name it.
    expect(resolveServerUrl(vercel)).toBe('wss://arc-armour.vercel.app:8090/');
  });

  it('honours an explicit ?server= override anywhere', () => {
    const location = at('arc-armour.vercel.app', 'https:', '?server=wss://play.example.com/');
    expect(serverConfigured(location)).toBe(true);
    expect(resolveServerUrl(location)).toBe('wss://play.example.com/');
  });

  it('ignores a malformed ?server= value', () => {
    const location = at('arc-armour.vercel.app', 'https:', '?server=javascript:alert(1)');
    expect(serverConfigured(location)).toBe(false);
    expect(resolveServerUrl(location)).toBe('wss://arc-armour.vercel.app:8090/');
  });
});
