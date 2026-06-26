import { api, VoucherInfo, PayQuoteResponse, User } from '../api';
import { escapeHtml } from '../escape';

const TICKET_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="18" height="18">
  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
</svg>`;

const STORE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="22" height="22">
  <path d="M3 9l1-6h16l1 6"/><path d="M3 9a2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0 2 2 2 2 0 0 0 2-2"/>
  <path d="M5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/>
  <rect x="9" y="14" width="6" height="6"/>
</svg>`;

function formatRands(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}

// ── Step 1: Merchant picker ───────────────────────────────────────────────────

function renderMerchantStep(
  container: HTMLElement,
  merchants: string[],
  onSelect: (merchant: string) => void
): void {
  container.innerHTML = `
    <div class="card send-card">
      <div class="step-indicator">
        <div class="step-dot active">1</div>
        <div class="step-line"></div>
        <div class="step-dot">2</div>
        <div class="step-line"></div>
        <div class="step-dot">3</div>
      </div>

      <div class="pay-header">
        <h2 class="pay-title">Where are you shopping?</h2>
        <p class="pay-subtitle">Select the merchant you're paying. Only matching vouchers will be applied.</p>
      </div>

      <div class="merchant-grid" id="merchant-grid">
        ${merchants.map(m => `
          <button class="merchant-tile" data-merchant="${escapeHtml(m)}" type="button">
            <span class="merchant-tile-icon">${STORE_SVG}</span>
            <span class="merchant-tile-name">${escapeHtml(m)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelector('#merchant-grid')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.merchant-tile');
    if (btn?.dataset.merchant) onSelect(btn.dataset.merchant);
  });
}

// ── Step 2: Amount + voucher summary ─────────────────────────────────────────

function renderAmountStep(
  container: HTMLElement,
  merchant: string,
  user: User,
  merchantVouchers: VoucherInfo[],
  onQuoteReady: (result: PayQuoteResponse) => void,
  onBack: () => void
): void {
  const noWallet      = !user.walletAddress;
  const hasVouchers   = merchantVouchers.length > 0;
  const totalBalance  = merchantVouchers.reduce((s, v) => s + v.balanceCents, 0);

  const voucherSummaryHtml = hasVouchers
    ? `
      <div class="pay-wallet-summary">
        <div class="pay-wallet-summary-header">
          <span class="pay-wallet-summary-title">${escapeHtml(merchant)} vouchers</span>
          <span class="pay-wallet-summary-total">${formatRands(totalBalance)} available</span>
        </div>
        ${merchantVouchers.map(v => `
          <div class="pay-wallet-voucher-row">
            <span class="pay-wallet-voucher-icon">${TICKET_SVG}</span>
            <span class="pay-wallet-voucher-label">${escapeHtml(v.label)}</span>
            <span class="pay-wallet-voucher-code">${escapeHtml(v.code)}</span>
            <span class="pay-wallet-voucher-balance">${formatRands(v.balanceCents)}</span>
          </div>
        `).join('')}
      </div>
    `
    : `
      <div class="warning-msg">
        You have no <strong>${escapeHtml(merchant)}</strong> vouchers loaded.
        The full amount will be paid from your ILP wallet.
        <a href="#/vouchers" style="margin-left:0.25rem">Load a voucher →</a>
      </div>
    `;

  container.innerHTML = `
    <div class="card send-card">
      <div class="step-indicator">
        <div class="step-dot done">✓</div>
        <div class="step-line done"></div>
        <div class="step-dot active">2</div>
        <div class="step-line"></div>
        <div class="step-dot">3</div>
      </div>

      <div class="pay-header">
        <h2 class="pay-title">Pay at ${escapeHtml(merchant)}</h2>
        <p class="pay-subtitle">
          ${hasVouchers
            ? `Your ${escapeHtml(merchant)} vouchers will auto-combine to cover as much as possible.`
            : `No ${escapeHtml(merchant)} vouchers — your ILP wallet will cover the full amount.`}
        </p>
      </div>

      ${noWallet && !hasVouchers ? `
        <div class="warning-msg">
          No wallet linked and no vouchers for this merchant.
          <a href="#/profile">Add your wallet address</a> or
          <a href="#/vouchers">load a voucher</a> first.
        </div>
      ` : noWallet ? `
        <div class="warning-msg">
          No wallet linked yet.
          <a href="#/profile">Add your wallet address</a> — needed if vouchers don't fully cover the amount.
        </div>
      ` : ''}

      ${voucherSummaryHtml}

      <form id="pay-form" class="send-form" novalidate>
        <div class="field">
          <label for="purchase-amount">Purchase amount (ZAR)</label>
          <div class="amount-wrap">
            <input
              id="purchase-amount"
              type="number"
              min="0.01"
              step="0.01"
              class="input"
              placeholder="0.00"
              required
              ${noWallet && !hasVouchers ? 'disabled' : ''}
            />
            <span class="amount-currency">ZAR</span>
          </div>
          ${hasVouchers ? `
            <span class="field-hint">
              Vouchers cover up to <strong>${formatRands(totalBalance)}</strong> —
              any remainder will be drawn from your ILP wallet.
            </span>
          ` : ''}
        </div>

        <div id="quote-error" class="error-msg" hidden></div>

        <div class="btn-row">
          <button type="button" class="btn btn-secondary" id="back-btn">← Back</button>
          <button
            type="submit"
            class="btn btn-africa-primary"
            id="pay-btn"
            ${noWallet && !hasVouchers ? 'disabled' : ''}
          >
            Get breakdown →
          </button>
        </div>
      </form>
    </div>
  `;

  container.querySelector('#back-btn')!.addEventListener('click', onBack);

  const form     = container.querySelector<HTMLFormElement>('#pay-form')!;
  const payBtn   = container.querySelector<HTMLButtonElement>('#pay-btn')!;
  const quoteErr = container.querySelector<HTMLDivElement>('#quote-error')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawAmount = parseFloat(
      container.querySelector<HTMLInputElement>('#purchase-amount')!.value
    );
    if (isNaN(rawAmount) || rawAmount <= 0) {
      quoteErr.textContent = 'Please enter a valid purchase amount.';
      quoteErr.hidden = false;
      return;
    }

    const purchaseAmountCents = Math.round(rawAmount * 100);

    if (noWallet && purchaseAmountCents > totalBalance) {
      quoteErr.textContent =
        `Your ${merchant} vouchers don't fully cover this amount and you have no wallet linked. Add a wallet in your Profile.`;
      quoteErr.hidden = false;
      return;
    }

    payBtn.disabled    = true;
    payBtn.textContent = 'Calculating…';
    quoteErr.hidden    = true;

    try {
      const result = await api.pay.quote({ purchaseAmountCents, merchant });
      onQuoteReady(result);
    } catch (err: unknown) {
      quoteErr.textContent = err instanceof Error ? err.message : String(err);
      quoteErr.hidden = false;
    } finally {
      payBtn.disabled    = false;
      payBtn.textContent = 'Get breakdown →';
    }
  });
}

// ── Main exported function ────────────────────────────────────────────────────

export async function renderPayView(
  container: HTMLElement,
  user: User,
  onQuoteReady: (result: PayQuoteResponse) => void
): Promise<void> {
  // Loading spinner while we fetch merchants + vouchers
  container.innerHTML = `
    <div class="card send-card">
      <div class="step-indicator">
        <div class="step-dot active">1</div>
        <div class="step-line"></div>
        <div class="step-dot">2</div>
        <div class="step-line"></div>
        <div class="step-dot">3</div>
      </div>
      <div class="pay-header"><h2 class="pay-title">Pay with Vouchers</h2></div>
      <div class="spinner"></div>
    </div>
  `;

  let merchants: string[]    = [];
  let myVouchers: VoucherInfo[] = [];

  try {
    [merchants, myVouchers] = await Promise.all([
      api.pay.merchants(),
      api.pay.myVouchers(),
    ]);
  } catch {
    container.innerHTML = `<div class="card"><p class="error-msg">Failed to load merchant data.</p></div>`;
    return;
  }

  // Step 1 → Step 2 flow
  function showMerchantPicker(): void {
    renderMerchantStep(container, merchants, (selectedMerchant) => {
      const merchantVouchers = myVouchers.filter(v => v.provider === selectedMerchant);
      renderAmountStep(
        container,
        selectedMerchant,
        user,
        merchantVouchers,
        onQuoteReady,
        showMerchantPicker   // back button goes back to picker
      );
    });
  }

  showMerchantPicker();
}
