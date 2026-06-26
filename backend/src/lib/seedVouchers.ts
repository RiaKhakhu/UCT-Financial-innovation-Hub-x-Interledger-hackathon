import crypto from 'node:crypto';
import { db } from '../db';
import { vouchers } from '../db/schema';
import { config } from '../config';

// Seed a handful of demo vouchers on first boot.
// balanceCents is ZAR cents (integer): 10000 = R100.00
// merchantWallet is the app's own configured wallet so the demo works
// without needing a separate merchant account.

const SEED: Array<{ code: string; label: string; balanceCents: number }> = [
  { code: 'PICK-1234-ABCD', label: 'Checkers R100 Gift Card',    balanceCents: 10000 },
  { code: 'WOOL-5678-EFGH', label: 'Woolworths R200 Gift Card',  balanceCents: 20000 },
  { code: 'SPAR-9012-IJKL', label: 'SPAR R50 Gift Card',         balanceCents:  5000 },
  { code: 'EDGR-3456-MNOP', label: 'Edgars R150 Gift Card',      balanceCents: 15000 },
  { code: 'GAME-7890-QRST', label: 'Game Stores R500 Gift Card', balanceCents: 50000 },
];

export async function seedVouchers(): Promise<void> {
  const existing = await db.select({ id: vouchers.id }).from(vouchers).limit(1);
  if (existing.length > 0) return; // already seeded

  const now = new Date();
  await db.insert(vouchers).values(
    SEED.map(v => ({
      id:             crypto.randomUUID(),
      code:           v.code,
      label:          v.label,
      balanceCents:   v.balanceCents,
      merchantWallet: 'https://ilp.interledger-test.dev/theguy',
      status:         'ACTIVE' as const,
      createdAt:      now,
      updatedAt:      now,
    }))
  );

  console.log(`[seed] Vouchers seeded: ${SEED.length} demo vouchers`);
}
