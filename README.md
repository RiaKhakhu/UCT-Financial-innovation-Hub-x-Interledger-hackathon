# Voucher2

Voucher2 is an Interledger demo web app for South African retail checkout that combines store gift vouchers with an ILP wallet top-up. It lets users load provider-specific vouchers, apply them to a purchase, and automatically top up any remaining amount through an Interledger Open Payments payment.

## What this app does

- Allows users to load gift vouchers from a shared pool into their account.
- Keeps vouchers locked to a specific provider/merchant.
- Auto-combines multiple vouchers for the same provider in oldest-first order.
- Covers any remainder with an Interledger (ILP) wallet transaction.
- Runs on the Interledger test network using play money only.

## Tech stack

### Backend

- Node.js + TypeScript
- Express
- Drizzle ORM + libsql (SQLite)
- @interledger/open-payments SDK
- JWT auth with `jsonwebtoken` and `bcryptjs`
- `tsx` for development hot reload

### Frontend

- Vanilla TypeScript
- Vite-powered SPA
- Hash-based routing (`#/route`)
- Plain `src/views/` files render HTML via `innerHTML`

## Repository layout

```
backend/
  .env.example
  openremit.db
  private.key/
  package.json
  tsconfig.json
  src/
    config.ts
    index.ts
    db/
      index.ts
      schema.ts
    lib/
      openPayments.ts
      quoteFlow.ts
      seedNews.ts
      seedVouchers.ts
    middleware/
      errorHandler.ts
      requireAuth.ts
    routes/
      auth.ts
      callback.ts
      news.ts
      pay.ts
      remit.ts
      requests.ts
      users.ts

frontend/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    api.ts
    auth.ts
    avatar.ts
    escape.ts
    main.ts
    money.ts
    pointer.ts
    styles.css
    txStatus.ts
    views/
      consentView.ts
      historyView.ts
      homeView.ts
      loginView.ts
      newsArticleView.ts
      newsView.ts
      payConsentView.ts
      paySuccessView.ts
      payView.ts
      profileView.ts
      publicProfileView.ts
      quoteView.ts
      receiveView.ts
      signupView.ts
      statusView.ts
      vouchersView.ts
```

## Key backend concepts

### Voucher model

Vouchers are stored in a single table and can be either:
- a pool voucher (`user_id` is `NULL`), or
- a user-owned voucher (`user_id` is set).

Important voucher fields:
- `code` — unique voucher code
- `provider` — merchant name (e.g. Checkers, Woolworths)
- `label` — human-friendly label
- `balance_cents` — remaining value in ZAR cents
- `merchant_wallet` — ILP wallet address for top-ups
- `status` — `ACTIVE`, `DEPLETED`, or `EXPIRED`

### Payment flow

The backend pay flow is in `backend/src/routes/pay.ts`:
- `GET /api/pay/merchants` — available merchant names from active vouchers
- `GET /api/pay/providers` — providers with unclaimed pool vouchers
- `POST /api/pay/load` — claim a voucher code for the signed-in user
- `GET /api/pay/my-vouchers` — list a user's active vouchers
- `POST /api/pay/quote` — build a payment quote that drains vouchers first, then creates an ILP quote for any remainder
- `POST /api/pay/confirm` — deduct vouchers after a successful top-up payment

When a purchase needs a top-up, the backend uses `FIXED_RECEIVE` and quotes the remaining ZAR amount to the user’s wallet.

## Open Payments / ILP configuration

The backend is configured from `backend/.env` using:

- `OP_WALLET_ADDRESS` — the app signing wallet address
- `OP_KEY_ID` — key ID for the signing wallet
- `OP_PRIVATE_KEY_PATH` — path to the private key PEM or base64 DER blob

The private key loader in `backend/src/lib/openPayments.ts` accepts either:
- a normal PEM file with `-----BEGIN PRIVATE KEY-----`, or
- a bare base64 DER/PKCS8 blob, and wraps it into PEM.

## Database

The project uses SQLite via Drizzle. Live data is stored in `backend/openremit.db`.

To reset the database, delete `backend/openremit.db` and restart the backend. The app seeds demo vouchers and news posts on first boot.

## Demo voucher pool

The app seeds a sample pool of vendor-specific vouchers. Each voucher is only usable at its listed provider.

Example seeded vouchers:
- Checkers: R100, R50, R200
- Woolworths: R200, R100, R500
- SPAR: R50, R100
- Edgars: R150, R75
- Game Stores: R500, R250

## Frontend behavior

The frontend is a hash-based SPA with routes for:
- `#/` — home/dashboard
- `#/login` — login
- `#/signup` — signup
- `#/profile` — profile and wallet setup
- `#/vouchers` — voucher wallet and load form
- `#/pay` — pay flow merchant + amount entry
- `#/pay-consent` — payment breakdown and authorization
- `#/pay-success` — voucher-only success
- `#/history` — transaction history

The UI displays ZAR amounts and uses voucher values in ZAR cents.

## Known limitations

1. Voucher deduction for the ILP top-up path is not currently wired through `GET /api/callback`. Top-up payments complete the ILP path, but the voucher deduction step still relies on `POST /api/pay/confirm`.
2. `JWT_SECRET` defaults to `changeme` in `.env`. Change it before any real deployment.
3. All sample providers currently share the same merchant wallet address. The schema supports per-voucher merchant wallets.
4. The provider dropdown may still show a provider when its pool vouchers are exhausted.
5. There is no admin interface for removing or managing vouchers once loaded.

## Local development

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend starts on port `3001`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on port `5173`.

## Notes

- This app is designed for the Interledger test network only.
- Voucher balances are stored in ZAR
- User wallet addresses are normalized before use, and wallet-based quotes are created through the Open Payments API.
