# Voucher2

> Pay with gift card vouchers — top up via the Interledger network when the balance runs short.

Voucher2 is a TypeScript monorepo built on top of the [Open Payments](https://openpayments.dev) protocol. It combines a voucher-redemption system (think retail gift cards) with ILP-powered top-up payments: the user enters a voucher code, the backend deducts as much as the voucher covers, and if the purchase amount exceeds the balance it triggers an Open Payments flow to cover the remainder from the user's ILP wallet.

The project also ships a full peer-to-peer remittance flow, payment requests ("asks"), and a Web Monetization-powered news paywall ("The Ledger") — all useful reference implementations for hackathon exploration.

---

## Features

- **Voucher redemption** — enter a gift card code, see the remaining balance, and pay for purchases. The voucher covers as much as it can; any shortfall is topped up via Open Payments.
- **Hybrid payment flow** — if `topUpCents > 0` the normal GNAP consent → callback pipeline runs, then the voucher balance is deducted atomically after the ILP payment lands. If the voucher fully covers the purchase, no wallet interaction is needed.
- **Peer-to-peer remittance** — send money between ILP wallet addresses with a full quote → consent → callback flow.
- **Payment requests** — request money from another user (`FIXED_SEND` or `FIXED_RECEIVE`). The payer fulfils through the same quote flow.
- **The Ledger (news paywall)** — monetised articles unlocked by Web Monetization streaming or a one-off Open Payments fallback.
- **User accounts** — JWT auth, profiles with wallet address and avatar, user search.

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- An account at [wallet.interledger-test.dev](https://wallet.interledger-test.dev) with a key pair generated and uploaded

### 1. Clone and install

```bash
git clone <repo-url> voucher2 && cd voucher2
npm install
```

### 2. Get your wallet credentials

1. Create an account at [wallet.interledger-test.dev](https://wallet.interledger-test.dev) and create a wallet address.
2. Go to **Settings → Developer Keys → Add Key** to generate a key pair. Download the private key file.

### 3. Configure

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

| Variable | Description |
|---|---|
| `OP_WALLET_ADDRESS` | Your wallet URL, e.g. `https://ilp.interledger-test.dev/alice` |
| `OP_KEY_ID` | The UUID of the key you uploaded |
| `OP_PRIVATE_KEY_PATH` | Path to the `.pem` file, e.g. `./private.key/euracc.pem` |
| `JWT_SECRET` | A long random string for signing JWTs |

### 4. Initialise the database

```bash
npm run db:push
```

This creates the SQLite schema and seeds demo vouchers on first boot (see [Demo Vouchers](#demo-vouchers)).

### 5. Start

```bash
npm run dev      # backend :3001 + frontend :5173
```

Open [http://localhost:5173](http://localhost:5173).

---

## The Voucher Payment Flow

```
  Frontend                  Backend                   Open Payments Network
  ──────────────────────    ────────────────────────  ─────────────────────
  1. Enter voucher code     POST /api/pay/lookup
     → see balance          └─ validate code, return balance

  2. Enter purchase amount  POST /api/pay/quote
                            ├─ voucherCovers = min(balance, amount)
                            ├─ topUpCents = amount - voucherCovers
                            │
                            │  [topUpCents = 0]
                            └─ deduct voucher, return { requiresTopUp: false }
                               ↑ done — no wallet interaction needed
                            │
                            │  [topUpCents > 0]
                            ├─ walletAddress.get()   ──► Resolve wallets
                            ├─ incomingPayment.create()► Create incoming payment
                            └─ quote.create()        ──► Get quote for top-up

  3. Review + Authorise     POST /api/remit/consent
                            ├─ grant.request()       ──► Interactive outgoing grant
                            └─ returns interactUrl

  4. Browser redirected ───────────────────────────────► Auth server consent page

  5. Auth server        ──► GET /api/callback
     redirects back         ├─ grant.continue()      ──► Exchange interact_ref
                            ├─ outgoingPayment.create()► Execute ILP top-up
                            └─ POST /api/pay/confirm ──  Deduct voucher balance
```

**Key point:** the voucher balance is only deducted *after* the ILP payment succeeds (or immediately if no top-up is needed). Abandoning the ILP flow leaves the voucher intact.

---

## API Reference

### Voucher Pay (`/api/pay`)

All routes require a `Bearer` JWT token.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/pay/lookup` | Validate a voucher code and return its balance |
| `POST` | `/api/pay/quote` | Calculate top-up needed and (if > 0) run the Open Payments quote flow |
| `POST` | `/api/pay/confirm` | Deduct the voucher balance after a successful ILP payment |

### Remittance (`/api/remit`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/remit/wallet-info` | Resolve a wallet's currency before quoting |
| `POST` | `/api/remit/quote` | Create incoming payment + quote |
| `POST` | `/api/remit/consent` | Request interactive outgoing grant, get redirect URL |
| `GET` | `/api/remit/status/:id` | Poll current transaction state |
| `GET` | `/api/remit/history` | Current user's sent payments |

### Auth (`/api/auth`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register — returns `{ token, user }` |
| `POST` | `/api/auth/login` | Login — returns `{ token, user }` |
| `GET` | `/api/auth/me` | Current user profile |
| `PATCH` | `/api/auth/me` | Update profile (name, email, password, wallet address, avatar) |

### Users (`/api/users`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users/search?q=` | Find users by display name |
| `GET` | `/api/users/:id` | Public profile + shared transactions |

### Payment Requests (`/api/requests`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/requests` | Create a payment request (ask another user to pay you) |
| `GET` | `/api/requests` | List incoming and outgoing asks for the current user |
| `POST` | `/api/requests/:id/fulfill` | Payer accepts — runs quote flow and returns a `QuoteResponse` |
| `POST` | `/api/requests/:id/decline` | Payer declines |
| `POST` | `/api/requests/:id/cancel` | Requester cancels |

### News paywall (`/api/news`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/news/posts` | List articles with per-reader `unlocked` flag |
| `GET` | `/api/news/posts/:id` | Single article — body returned only when unlocked or `freeToRead` |
| `POST` | `/api/news/posts/:id/wm-unlock` | Record a Web Monetization streaming unlock |
| `POST` | `/api/news/posts/:id/unlock` | Open Payments fallback unlock |

---

## Demo Vouchers

Seeded automatically on first boot (idempotent):

| Code | Label | Balance |
|---|---|---|
| `PICK-1234-ABCD` | Checkers R100 Gift Card | R100.00 |
| `WOOL-5678-EFGH` | Woolworths R200 Gift Card | R200.00 |
| `SPAR-9012-IJKL` | SPAR R50 Gift Card | R50.00 |
| `EDGR-3456-MNOP` | Edgars R150 Gift Card | R150.00 |
| `GAME-7890-QRST` | Game Stores R500 Gift Card | R500.00 |

All vouchers route top-up payments to the app's configured `OP_WALLET_ADDRESS`, so the demo works without a separate merchant account.

---

## Architecture

```
voucher2/
├── package.json                  ← workspace root — `npm run dev` starts everything
│
├── backend/
│   ├── examples/
│   │   └── p2p-open-payments-walkthrough.ts  ← standalone SDK reference (no web server / DB)
│   ├── src/
│   │   ├── index.ts              ← Express entry point
│   │   ├── config.ts             ← all env vars in one place
│   │   ├── lib/
│   │   │   ├── openPayments.ts   ← SDK client singleton
│   │   │   ├── quoteFlow.ts      ← shared resolve → incoming payment → quote flow
│   │   │   ├── seedVouchers.ts   ← seeds demo gift cards on first boot
│   │   │   └── seedNews.ts       ← seeds demo news articles on first boot
│   │   ├── db/
│   │   │   ├── schema.ts         ← users, transactions, payment_requests, posts, post_unlocks, vouchers
│   │   │   └── index.ts          ← Drizzle + libsql (SQLite) instance
│   │   ├── routes/
│   │   │   ├── pay.ts            ← voucher lookup / quote / confirm
│   │   │   ├── remit.ts          ← wallet-info / quote / consent / status / history
│   │   │   ├── callback.ts       ← GNAP redirect handler
│   │   │   ├── auth.ts           ← signup / login / profile (JWT)
│   │   │   ├── users.ts          ← user search + public profiles
│   │   │   ├── requests.ts       ← payment requests
│   │   │   └── news.ts           ← Web Monetization news paywall
│   │   └── middleware/
│   │       ├── requireAuth.ts    ← Bearer-token guard, sets req.user
│   │       └── errorHandler.ts
│   └── drizzle.config.ts
│
└── frontend/
    ├── index.html                ← header + nav shell; views render into #view
    └── src/
        ├── main.ts               ← hash router (#/login, #/pay, #/remit, …)
        ├── api.ts                ← typed fetch wrappers for every backend route
        ├── auth.ts               ← JWT storage helpers (localStorage)
        ├── escape.ts             ← escapeHtml() — sanitise all user-entered values
        ├── money.ts              ← currency formatting helpers
        ├── styles.css            ← edit :root vars to rebrand
        └── views/
            ├── homeView.ts
            ├── loginView.ts / signupView.ts
            ├── profileView.ts
            ├── publicProfileView.ts
            ├── quoteView.ts             ← Step 1: pick recipient + amount
            ├── consentView.ts           ← Step 2: confirm quote, redirect to wallet
            ├── historyView.ts
            ├── newsView.ts / newsArticleView.ts
            └── receiveView.ts           ← create payment requests
```

---

## Database Schema

Six tables in `backend/src/db/schema.ts`:

- **`users`** — JWT auth (bcrypt password hash), optional wallet address and avatar.
- **`transactions`** — tracks the Open Payments flow: `PENDING → AWAITING_GRANT → COMPLETED | FAILED`. Stores GNAP continuation details between `/consent` and `/callback`.
- **`payment_requests`** — peer-to-peer asks: `PENDING → COMPLETED | DECLINED | CANCELLED`. A failed payment leaves the row `PENDING` so the payer can retry.
- **`vouchers`** — gift card registry. Balance in ZAR cents. Status: `ACTIVE | DEPLETED | EXPIRED`.
- **`posts`** — news articles with a paywall. Supports one-off unlock and streaming Web Monetization.
- **`post_unlocks`** — one row per (post, user). Method: `WEB_MONETIZATION` or `OPEN_PAYMENTS`.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend (:3001) and frontend (:5173) |
| `npm run build` | Build both packages |
| `npm run db:push` | Push schema changes to SQLite (no migration files) |

Run inside `backend/` or `frontend/` to target a single package.

---

## Open Payments SDK Reference

The SDK client singleton lives in `backend/src/lib/openPayments.ts`. The shared quote flow is in `backend/src/lib/quoteFlow.ts`. A standalone walkthrough script (no web server or DB) is at `backend/examples/p2p-open-payments-walkthrough.ts` — a good starting point for understanding the SDK patterns.

Key patterns used throughout the codebase:

```typescript
// Resolve a wallet
const wallet = await client.walletAddress.get({ url: 'https://...' });
// wallet.authServer     → grant.request()
// wallet.resourceServer → incomingPayment / quote / outgoingPayment create()
// wallet.id             → walletAddress field in create() bodies

// Non-interactive grant (incoming payment, quote):
const grant = await client.grant.request(
  { url: wallet.authServer },
  { access_token: { access: [...] } }
);

// Interactive grant (outgoing payment):
const pending = await client.grant.request(
  { url: wallet.authServer },
  { access_token: { access: [...] }, interact: { start: ['redirect'], finish: { method: 'redirect', uri: callbackUrl, nonce } } }
);
// isPendingGrant(pending) === true
// pending.interact.redirect → send user to this URL

// After the user approves and is redirected back:
const final = await client.grant.continue(
  { url: pending.continue.uri, accessToken: pending.continue.access_token.value },
  { interact_ref }
);
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing required environment variable: OP_WALLET_ADDRESS` | Copy `backend/.env.example` to `backend/.env` and fill in credentials |
| `Grant continuation did not return an access token` | Consent was denied, expired, or already used — restart from the quote step |
| Frontend can't reach backend | Check `VITE_BACKEND_URL` in `frontend/.env` (default: `http://localhost:3001`) |
| Voucher balance not deducted | The ILP top-up may have failed — the voucher is left intact; retry the payment |
