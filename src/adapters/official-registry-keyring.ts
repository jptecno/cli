import { createHash } from 'node:crypto';

export const officialRegistryKeyring = new Map<string, string>([
  [
    'registry-2026-08',
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAD2T/94yW4zfpSDhTh2oMO8pHFaMYRNL6nHRpI4gxHNg=\n-----END PUBLIC KEY-----\n',
  ],
]);

export function fingerprintRegistryKeyring(
  keyring: ReadonlyMap<string, string>,
): string {
  const pairs = [...keyring.entries()].sort(([firstId], [secondId]) =>
    firstId < secondId ? -1 : firstId > secondId ? 1 : 0,
  );

  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}
