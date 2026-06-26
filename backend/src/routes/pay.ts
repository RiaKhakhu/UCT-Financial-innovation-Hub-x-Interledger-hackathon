import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { vouchers, users } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { createQuoteTransaction } from '../lib/quoteFlow';
import { normaliseWalletAddress } from '../lib/openPayments';

export const payRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pay/lookup
//
// Validate a voucher code and return its details without deducting anything.
// Used by the frontend to show the balance before the user commits.
// ─────────────────────────────────────────────────────────────────────────────
payRouter.post('/lookup', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code?.trim()) {
      return res.status(400).json({ error: 'Voucher code is required' });
    }

    const voucher = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.code, code.trim().toUpperCase()))
      .get();

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher code not found' });
    }
    if (voucher.status === 'DEPLETED') {
      return res.status(409).json({ error: 'This voucher has already been fully used' });
    }
    if (voucher.status === 'EXPIRED') {
      return res.status(409).json({ error: 'This voucher has expired' });
    }

    // Return balance in cents and major units for display
    res.json({
      id:           voucher.id,
      code:         voucher.code,
      label:        voucher.label,
      balanceCents: voucher.balanceCents,
      balanceRands: (voucher.balanceCents / 100).toFixed(2),
      status:       voucher.status,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pay/quote
//
// The main voucher-pay flow:
//   1. Validate voucher + purchase amount
//   2. Calculate how much the ILP wallet needs to top up
//   3. If topUp > 0: run the Open Payments quote flow and return a QuoteResponse
//      so the frontend can continue into the normal consent → callback pipeline.
//   4. If topUp = 0 (voucher covers everything): deduct from voucher immediately
//      and return a "no-wallet-needed" response.
//
// The voucher balance is NOT deducted here — it's deducted in /api/pay/confirm
// after the ILP payment completes (or immediately if no top-up is needed).
// This prevents the voucher being consumed if the user abandons the ILP flow.
// ─────────────────────────────────────────────────────────────────────────────
payRouter.post('/quote', requireAuth, async (req, res, next) => {
  try {
    const { voucherId, purchaseAmountCents } = req.body as {
      voucherId?:           string;
      purchaseAmountCents?: number;
    };

    if (!voucherId || purchaseAmountCents == null) {
      return res.status(400).json({ error: 'voucherId and purchaseAmountCents are required' });
    }
    if (!Number.isInteger(purchaseAmountCents) || purchaseAmountCents <= 0) {
      return res.status(400).json({ error: 'purchaseAmountCents must be a positive integer' });
    }

    const voucher = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.id, voucherId))
      .get();

    if (!voucher || voucher.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'Voucher not found or no longer active' });
    }

    const voucherCovers = Math.min(voucher.balanceCents, purchaseAmountCents);
    const topUpCents    = purchaseAmountCents - voucherCovers;

    // Case A: voucher fully covers the purchase — no ILP payment needed
    if (topUpCents === 0) {
      // Deduct immediately
      const newBalance = voucher.balanceCents - voucherCovers;
      await db
        .update(vouchers)
        .set({
          balanceCents: newBalance,
          status:       newBalance === 0 ? 'DEPLETED' : 'ACTIVE',
          updatedAt:    new Date(),
        })
        .where(eq(vouchers.id, voucherId));

      return res.json({
        requiresTopUp:  false,
        voucherCovers:  voucherCovers,
        topUpCents:     0,
        voucherLabel:   voucher.label,
        transactionId:  null,
        quote:          null,
      });
    }

    // If top-up is needed, look up the user's wallet from the DB
    const [userRow] = await db
      .select({ walletAddress: users.walletAddress })
      .from(users)
      .where(eq(users.id, req.user!.id));

    if (!userRow?.walletAddress) {
      return res.status(400).json({
        error: 'You need to add a wallet address to your profile before paying the top-up',
      });
    }

    // topUpCents is the shortfall the ILP wallet must cover.
    // We use FIXED_RECEIVE so the merchant receives exactly topUpCents
    // in their wallet's native currency (smallest unit), and the quote
    // resolves the sender's debit amount automatically.
    const result = await createQuoteTransaction({
      senderWalletAddress:   userRow.walletAddress,
      receiverWalletAddress: normaliseWalletAddress(voucher.merchantWallet),
      amount:                topUpCents.toString(),
      paymentType:           'FIXED_RECEIVE',
      userId:                req.user!.id,
    });

    res.json({
      requiresTopUp: true,
      voucherCovers: voucherCovers,
      topUpCents:    topUpCents,
      voucherLabel:  voucher.label,
      voucherId:     voucher.id,
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
// Called by /api/callback (after a successful ILP payment) to deduct the
// voucher balance. Also callable directly by the frontend for the no-top-up
// path (though that's already handled in /quote above).
//
// Idempotent: if the voucher was already deducted (e.g. double-call), it's a no-op.
// ─────────────────────────────────────────────────────────────────────────────
payRouter.post('/confirm', requireAuth, async (req, res, next) => {
  try {
    const { voucherId, deductCents } = req.body as {
      voucherId?:   string;
      deductCents?: number;
    };

    if (!voucherId || deductCents == null) {
      return res.status(400).json({ error: 'voucherId and deductCents are required' });
    }

    const voucher = await db.select().from(vouchers).where(eq(vouchers.id, voucherId)).get();
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });

    const newBalance = Math.max(0, voucher.balanceCents - deductCents);
    await db
      .update(vouchers)
      .set({
        balanceCents: newBalance,
        status:       newBalance === 0 ? 'DEPLETED' : 'ACTIVE',
        updatedAt:    new Date(),
      })
      .where(eq(vouchers.id, voucherId));

    res.json({ ok: true, remainingCents: newBalance });
  } catch (err) {
    next(err);
  }
});
