import { config } from './config';
import express from 'express';
import cors from 'cors';
import { remitRouter } from './routes/remit';
import { callbackRouter } from './routes/callback';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { payRouter } from './routes/pay';
import { errorHandler } from './middleware/errorHandler';
import { seedVouchers } from './lib/seedVouchers';

const app = express();

app.use(cors({ origin: config.frontendUrl, credentials: true }));
// Default limit is 100 KB — too small for base64 avatar uploads (up to ~280 KB)
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'voucher2-backend' });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/pay', payRouter);
app.use('/api/remit', remitRouter);   // kept: reuses status + history endpoints
app.use('/api/callback', callbackRouter);

app.use(errorHandler);

// Seed demo vouchers on first boot (idempotent — no-op if any exist).
seedVouchers().catch((err) => console.error('[seed] Voucher seed failed:', err));

app.listen(config.port, () => {
  console.log(`\n  Voucher2 backend → http://localhost:${config.port}\n`);
});
