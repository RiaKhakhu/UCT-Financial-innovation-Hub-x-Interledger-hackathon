import crypto from 'node:crypto';
import { db } from '../db';
import { vouchers } from '../db/schema';

// ─── Pool vouchers (userId = null = unissued) ─────────────────────────────
// These represent the "provider DB" — codes a user can claim via /api/pay/load.
// merchantWallet is the ZAR test wallet all top-ups flow to.

const MERCHANT_WALLET = 'https://ilp.interledger-test.dev/theguy';

const POOL: Array<{ code: string; provider: string; label: string; balanceCents: number }> = [
  // Checkers
  { code: 'PICK-1234-ABCD', provider: 'Checkers', label: 'Checkers R100 Gift Card',    balanceCents: 10000 },
  { code: 'PICK-2345-BCDE', provider: 'Checkers', label: 'Checkers R50 Gift Card',     balanceCents:  5000 },
  { code: 'PICK-3456-CDEF', provider: 'Checkers', label: 'Checkers R200 Gift Card',    balanceCents: 20000 },
  // Woolworths
  { code: 'WOOL-5678-EFGH', provider: 'Woolworths', label: 'Woolworths R200 Gift Card', balanceCents: 20000 },
  { code: 'WOOL-6789-FGHI', provider: 'Woolworths', label: 'Woolworths R100 Gift Card', balanceCents: 10000 },
  { code: 'WOOL-7890-GHIJ', provider: 'Woolworths', label: 'Woolworths R500 Gift Card', balanceCents: 50000 },
  // SPAR
  { code: 'SPAR-9012-IJKL', provider: 'SPAR',       label: 'SPAR R50 Gift Card',        balanceCents:  5000 },
  { code: 'SPAR-0123-JKLM', provider: 'SPAR',       label: 'SPAR R100 Gift Card',       balanceCents: 10000 },
  // Edgars
  { code: 'EDGR-3456-MNOP', provider: 'Edgars',     label: 'Edgars R150 Gift Card',     balanceCents: 15000 },
  { code: 'EDGR-4567-NOPQ', provider: 'Edgars',     label: 'Edgars R75 Gift Card',      balanceCents:  7500 },
  // Game Stores
  { code: 'GAME-7890-QRST', provider: 'Game Stores', label: 'Game Stores R500 Gift Card', balanceCents: 50000 },
  { code: 'GAME-8901-RSTU', provider: 'Game Stores', label: 'Game Stores R250 Gift Card', balanceCents: 25000 },
];

export async function seedVouchers(): Promise<void> {
  const existing = await db.select({ id: vouchers.id }).from(vouchers).limit(1);
  if (existing.length > 0) return; // already seeded

  const now = new Date();
  await db.insert(vouchers).values(
    POOL.map(v => ({
      id:             crypto.randomUUID(),
      code:           v.code,
      provider:       v.provider,
      label:          v.label,
      balanceCents:   v.balanceCents,
      merchantWallet: MERCHANT_WALLET,
      userId:         null,           // pool — not yet loaded by any user
      status:         'ACTIVE' as const,
      createdAt:      now,
      updatedAt:      now,
    }))
  );

  console.log(`[seed] Vouchers seeded: ${POOL.length} pool vouchers`);
}
