import { api, VoucherInfo, PayQuoteResponse, User } from '../api';
import { escapeHtml } from '../escape';

// SVG ticket icon
const TICKET_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="22" height="22">
  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
</svg>`;

function formatRands(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}

function voucherCardHtml(v: VoucherInfo): string {
  return `
    <div class="voucher-card">
      <div class="voucher-icon">${TICKET_SVG}</div>
      <div class="voucher-info">
        <span class="voucher-label">${escapeHtml(v.label)}</span>
        <span class="voucher-code">${escapeHtml(v.code)}</span>
      </div>
      <span class="voucher-balance">${formatRands(v.balanceCents)}</span>
    </div>
  `;
}

export function renderPayView(
  container: HTMLElement,
  user: User,
  onQuoteReady: (result: PayQuoteResponse, voucher: VoucherInfo) => void
): void {
  const noWallet = !user.walletAddress;

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
        <h2 class="pay-title">Pay with Voucher</h2>
        <p class="pay-subtitle">Enter your purchase amount and voucher code. Your wallet covers any remainder.</p>
      </div>

      ${noWallet ? `
        <div class="warning-msg">
          No wallet linked yet.
          <a href="#/profile">Add your wallet address on your Profile</a> — it's needed to pay any top-up.
        </div>
      ` : ''}

      <div class="demo-hint">
        <strong>Demo voucher codes:</strong>
        <ul class="demo-voucher-list">
          <li>PICK-1234-ABCD — R100.00</li>
          <li>WOOL-5678-EFGH — R200.00</li>
          <li>SPAR-9012-IJKL — R50.00</li>
          <li>EDGR-3456-MNOP — R150.00</li>
          <li>GAME-7890-QRST — R500.00</li>
        </ul>
      </div>

      <form id="pay-form" class="send-form" novalidate>

        <div class="field">
          <label for="purchase-amount">Purchase amount (ZAR)</label>
          <div class="amount-wrap">
            <input
              id="purchase-amount"
              name="purchaseAmount"
              type="number"
              min="0.01"
              step="0.01"
              class="input"
              placeholder="0.00"
              required
            />
            <span class="amount-currency">ZAR</span>
          </div>
        </div>

        <div class="field">
          <label for="voucher-code">Voucher code</label>
          <div class="search-row">
            <input
              id="voucher-code"
              name="voucherCode"
              type="text"
              class="input"
              placeholder="e.g. PICK-1234-ABCD"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
            />
            <button type="button" class="btn btn-secondary" id="lookup-btn">Check</button>
          </div>
          <div id="voucher-error" class="error-msg" hidden></div>
        </div>

        <div id="voucher-display" hidden></div>

        <div id="quote-error" class="error-msg" hidden></div>

        <button
          type="submit"
          class="btn btn-africa-primary"
          id="pay-btn"
          disabled
        >
          Get breakdown →
        </button>
      </form>
    </div>
  `;

  const form          = container.querySelector<HTMLFormElement>('#pay-form')!;
  const lookupBtn     = container.querySelector<HTMLButtonElement>('#lookup-btn')!;
  const payBtn        = container.querySelector<HTMLButtonElement>('#pay-btn')!;
  const voucherErr    = container.querySelector<HTMLDivElement>('#voucher-error')!;
  const quoteErr      = container.querySelector<HTMLDivElement>('#quote-error')!;
  const voucherDisplay = container.querySelector<HTMLDivElement>('#voucher-display')!;
  const codeInput     = container.querySelector<HTMLInputElement>('#voucher-code')!;

  let confirmedVoucher: VoucherInfo | null = null;

  function clearVoucher(): void {
    confirmedVoucher         = null;
    voucherDisplay.hidden    = true;
    voucherDisplay.innerHTML = '';
    payBtn.disabled          = true;
  }

  async function doLookup(): Promise<void> {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;

    lookupBtn.disabled    = true;
    lookupBtn.textContent = '…';
    voucherErr.hidden     = true;
    clearVoucher();

    try {
      const voucher        = await api.pay.lookup(code);
      confirmedVoucher     = voucher;
      voucherDisplay.innerHTML = voucherCardHtml(voucher);
      voucherDisplay.hidden    = false;
      payBtn.disabled          = false;
    } catch (err: unknown) {
      voucherErr.textContent = err instanceof Error ? err.message : String(err);
      voucherErr.hidden      = false;
    } finally {
      lookupBtn.disabled    = false;
      lookupBtn.textContent = 'Check';
    }
  }

  lookupBtn.addEventListener('click', doLookup);
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doLookup(); }
  });
  // Clear confirmed voucher if the user edits the code field
  codeInput.addEventListener('input', clearVoucher);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirmedVoucher) return;

    const rawAmount = parseFloat(
      (container.querySelector<HTMLInputElement>('#purchase-amount')!.value)
    );
    if (isNaN(rawAmount) || rawAmount <= 0) {
      quoteErr.textContent = 'Please enter a valid purchase amount.';
      quoteErr.hidden      = false;
      return;
    }

    // Convert ZAR major units → cents (integer)
    const purchaseAmountCents = Math.round(rawAmount * 100);

    // If top-up is needed but no wallet linked, block here
    if (noWallet && purchaseAmountCents > confirmedVoucher.balanceCents) {
      quoteErr.textContent =
        'Your voucher doesn\'t fully cover this amount and you have no wallet linked. Add a wallet in your Profile.';
      quoteErr.hidden = false;
      return;
    }

    payBtn.disabled    = true;
    payBtn.textContent = 'Calculating…';
    quoteErr.hidden    = true;

    try {
      const result = await api.pay.quote({
        voucherId:           confirmedVoucher.id,
        purchaseAmountCents,
      });
      onQuoteReady(result, confirmedVoucher);
    } catch (err: unknown) {
      quoteErr.textContent = err instanceof Error ? err.message : String(err);
      quoteErr.hidden      = false;
    } finally {
      payBtn.disabled    = false;
      payBtn.textContent = 'Get breakdown →';
    }
  });
}
