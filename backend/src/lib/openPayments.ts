import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createAuthenticatedClient,
  isPendingGrant,
  isFinalizedGrantWithAccessToken,
} from '@interledger/open-payments';
import type { Grant, GrantContinuation, GrantWithAccessToken, PendingGrant } from '@interledger/open-payments';
import { config } from '../config';

// Singleton — one authenticated client per process lifetime.
// The client signs every request with the Ed25519 private key.
let _client: Awaited<ReturnType<typeof createAuthenticatedClient>> | null = null;

/**
 * Load the private key from the configured path.
 * The .pem file may either be:
 *   (a) A proper PEM file with -----BEGIN PRIVATE KEY----- headers, or
 *   (b) A bare base64-encoded DER/PKCS8 blob (no headers) — as produced by
 *       the Interledger test wallet developer-key download.
 * In case (b) we decode the base64, import it as DER, then re-export as PEM
 * so the Open Payments SDK always receives a well-formed PEM string.
 */
function loadPrivateKey(): Buffer {
  const keyPath = path.resolve(__dirname, '..', '..', config.op.privateKeyPath);
  const raw = fs.readFileSync(keyPath, 'utf8').trim();

  // Already a proper PEM — return as-is.
  if (raw.startsWith('-----')) {
    return Buffer.from(raw);
  }

  // Bare base64 DER (PKCS8) — wrap it properly.
  const der = Buffer.from(raw, 'base64');
  const keyObject = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const pem = keyObject.export({ type: 'pkcs8', format: 'pem' }) as string;
  return Buffer.from(pem);
}

export async function getClient() {
  if (_client) return _client;

  const privateKey = loadPrivateKey();

  _client = await createAuthenticatedClient({
    walletAddressUrl: config.op.walletAddress,
    keyId:            config.op.keyId,
    privateKey,
  });
  return _client;
}

// Convert shorthand "$ilp.example.com/alice" → "https://ilp.example.com/alice".
// The SDK also accepts full https:// URLs, so this is safe to call either way.
export function normaliseWalletAddress(addr: string): string {
  return addr.startsWith('$') ? `https://${addr.slice(1)}` : addr;
}

// Type guard for grants that are finalised and carry a usable access token.
// Composes the SDK's own guards so it works for both fresh grant requests
// (PendingGrant | Grant) and grant continuations (GrantContinuation | Grant).
export function isFinalizedGrant(
  grant: PendingGrant | GrantContinuation | Grant
): grant is GrantWithAccessToken {
  return !isPendingGrant(grant) && isFinalizedGrantWithAccessToken(grant);
}
