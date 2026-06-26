import { Router } from 'express';
import { eq, and, isNull, isNotNull, asc } from 'drizzle-orm';
import { db } from '../db';
import { vouchers, users } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { createQuoteTransaction } from '../lib/quoteFlow';
import { normaliseWalletAddress } from '../lib/openPayments';
import crypto from 'node:crypto';

export const payRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pay/merchants
//
// Returns distinct merchant (provider) names — one per unique provider in the
// voucher pool, regardless of claimed status. Used to populate the merchant
// picker on the pay page.
// ─────────────────────────────────────────────────────────────────────────────
payRouter.get('/merchants', requireAuth, async (req, res, next) => {
  try {
    const rows = await db
      .selectDistinct({ provider: vouchers.provider })
      .from(vouchers)
      .where(eq(vouchers.status, 'ACTIVE'))
      .all();

    res.json(rows.map(r => r.provider).sort());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pay/providers
//
// Returns the list of distinct provider names that have at least one unclaimed
// pool voucher. Used to populate the provider dropdown on the load form.
// ─────────────────────────────────────────────────────────────────────────────
payRouter.get('/providers', requireAuth, async (req, res, next) => {
  try {
    const rows = await db
      .selectDistinct({ provider: vouchers.provider })
      .from(vouchers)
      .where(and(eq(vouchers.status, 'ACTIVE'), isNull(vouchers.userId)))
      .all();

    res.json(rows.map(r => r.provider).sort());
  } catch (err) {
    next(err);
  }
});
//
// Claim a pool voucher onto the current user's account.
//   Body: { provider: string; code: string }
// Validates that:
//   • the code exists in the pool for that provider
//   • it is still ACTIVE and unclaimed (userId IS NULL)
// Then sets userId = req.user.id so it appears in the user's wallet.
// ─────────────────────────────────────────────────────────────────────────────
payRouter.post('/load', requireAuth, async (req, res, next) => {
  try {
    const { provider, code } = req.body as { provider?: string; code?: string };
    if (!provider?.trim() || !code?.trim()) {
      return res.status(400).json({ error: 'provider and code are required' });
    }

    const voucher = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.code, code.trim().toUpperCase()))
      .get();

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher code not found' });
    }
    if (voucher.provider !== provider) {
      return res.status(400).json({ error: `This code does not belong to ${provider}` });
    }
    if (voucher.status === 'DEPLETED') {
      return res.status(409).json({ error: 'This voucher has already been fully used' });
    }
    if (voucher.status === 'EXPIRED') {
      return res.status(409).json({ error: 'This voucher has expired' });
    }
    if (voucher.userId !== null) {
      // Already claimed — if it belongs to this user, treat as a friendly duplicate
      if (voucher.userId === req.user!.id) {
        return res.status(409).json({ error: 'You have already loaded this voucher' });
      }
      return res.status(409).json({ error: 'This voucher has already been claimed' });
    }

    await db
      .update(vouchers)
      .set({ userId: req.user!.id, updatedAt: new Date() })
      .where(eq(vouchers.id, voucher.id));

    res.json({
      id:           voucher.id,
      code:         voucher.code,
      provider:     voucher.provider,
      label:        voucher.label,
      balanceCents: voucher.balanceCents,
      status:       voucher.status,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pay/my-vouchers
//
// Returns all vouchers loaded onto the current user's account (ACTIVE ones
// ordered oldest-first so the UI shows them consistently).
// ─────────────────────────────────────────────────────────────────────────────
payRouter.get('/my-vouchers', requireAuth, async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.userId, req.user!.id), eq(vouchers.status, 'ACTIVE')))
      .orderBy(asc(vouchers.createdAt))
      .all();

    res.json(rows.map(v => ({
      id:           v.id,
      code:         v.code,
      provider:     v.provider,
      label:        v.label,
      balanceCents: v.balanceCents,
      status:       v.status,
    })));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pay/quote
//
// Merchant-aware multi-voucher pay flow:
//   1. Accept `merchant` (provider name) — only vouchers from that provider
//      are eligible for auto-combine.
//   2. Drain matching vouchers oldest-first to cover as much as possible.
//   3. If there are no matching vouchers, the full amount is an ILP top-up.
//   4. If a remainder exists: run the Open Payments quote flow.
// ─────────────────────────────────────────────────────────────────────────────
payRouter.post('/quote', requireAuth, async (req, res, next) => {
  try {
    const { purchaseAmountCents, merchant } = req.body as {
      purchaseAmountCents?: number;
      merchant?:            string;
    };

    if (purchaseAmountCents == null) {
      return res.status(400).json({ error: 'purchaseAmountCents is required' });
    }
    if (!Number.isInteger(purchaseAmountCents) || purchaseAmountCents <= 0) {
      return res.status(400).json({ error: 'purchaseAmountCents must be a positive integer' });
    }
    if (!merchant?.trim()) {
      return res.status(400).json({ error: 'merchant is required' });
    }

    // Fetch the user's ACTIVE vouchers for this merchant only, oldest first
    const userVouchers = await db
      .select()
      .from(vouchers)
      .where(and(
        eq(vouchers.userId,   req.user!.id),
        eq(vouchers.status,   'ACTIVE'),
        eq(vouchers.provider, merchant.trim()),
      ))
      .orderBy(asc(vouchers.createdAt))
      .all();

    // Also need the merchant wallet — grab from any pool voucher for this provider
    const poolVoucher = await db
      .select({ merchantWallet: vouchers.merchantWallet })
      .from(vouchers)
      .where(eq(vouchers.provider, merchant.trim()))
      .get();

    if (!poolVoucher) {
      return res.status(400).json({ error: `Unknown merchant: ${merchant}` });
    }

    // ── Greedy drain: consume matching vouchers oldest-first ──────────────
    let remaining = purchaseAmountCents;
    const contributions: Array<{ voucherId: string; label: string; deductCents: number }> = [];

    for (const v of userVouchers) {
      if (remaining <= 0) break;
      const take = Math.min(v.balanceCents, remaining);
      if (take > 0) {
        contributions.push({ voucherId: v.id, label: v.label, deductCents: take });
        remaining -= take;
      }
    }

    const voucherCovers = purchaseAmountCents - remaining;
    const topUpCents    = remaining;

    // ── Case A: vouchers fully cover the purchase ─────────────────────────
    if (topUpCents === 0) {
      const now = new Date();
      for (const c of contributions) {
        const v = userVouchers.find(x => x.id === c.voucherId)!;
        const newBalance = v.balanceCents - c.deductCents;
        await db
          .update(vouchers)
          .set({
            balanceCents: newBalance,
            status:       newBalance === 0 ? 'DEPLETED' : 'ACTIVE',
            updatedAt:    now,
          })
          .where(eq(vouchers.id, v.id));
      }

      return res.json({
        requiresTopUp:  false,
        voucherCovers,
        topUpCents:     0,
        merchant,
        contributions,
        transactionId:  null,
        quote:          null,
      });
    }

    // ── Case B: ILP top-up needed ─────────────────────────────────────────
    const [userRow] = await db
      .select({ walletAddress: users.walletAddress })
      .from(users)
      .where(eq(users.id, req.user!.id));

    if (!userRow?.walletAddress) {
      return res.status(400).json({
        error: 'You need to add a wallet address to your profile before paying any top-up',
      });
    }

    // FIXED_RECEIVE: merchant receives exactly topUpCents in ZAR; quote
    // resolves the debit amount in the sender's own currency automatically.
    const result = await createQuoteTransaction({
      senderWalletAddress:   userRow.walletAddress,
      receiverWalletAddress: normaliseWalletAddress(poolVoucher.merchantWallet),
      amount:                topUpCents.toString(),
      paymentType:           'FIXED_RECEIVE',
      userId:                req.user!.id,
    });

    res.json({
      requiresTopUp: true,
      voucherCovers,
      topUpCents,
      merchant,
      contributions,
      transactionId: result.transactionId,
      quote:         result.quote,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pay/confirm
//
// Called after a successful ILP payment (from /api/callback) to deduct
// voucher balances for the top-up path. Also used directly for the no-top-up
// path (though that already deducts in /quote).
// Body: { contributions: Array<{ voucherId: string; deductCents: number }> }
// ─────────────────────────────────────────────────────────────────────────────
payRouter.post('/confirm', requireAuth, async (req, res, next) => {
  try {
    const { contributions } = req.body as {
      contributions?: Array<{ voucherId: string; deductCents: number }>;
    };

    if (!Array.isArray(contributions) || contributions.length === 0) {
      return res.status(400).json({ error: 'contributions array is required' });
    }

    const now = new Date();
    for (const c of contributions) {
      const v = await db.select().from(vouchers).where(eq(vouchers.id, c.voucherId)).get();
      if (!v) continue;
      const newBalance = Math.max(0, v.balanceCents - c.deductCents);
      await db
        .update(vouchers)
        .set({
          balanceCents: newBalance,
          status:       newBalance === 0 ? 'DEPLETED' : 'ACTIVE',
          updatedAt:    now,
        })
        .where(eq(vouchers.id, v.id));
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
