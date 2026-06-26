import { api, PayQuoteResponse } from '../api';
import { escapeHtml } from '../escape';

function formatRands(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}

function formatMoney(value: string, assetCode: string, assetScale: number): string {
  return `${(Number(value) / 10 ** assetScale).toFixed(assetScale)} ${assetCode}`;
}

export function renderPayConsentView(
  container: HTMLElement,
  result: PayQuoteResponse,
  purchaseAmountCents: number,
  onBack: () => void
): void {
  const { debitAmount, receiveAmount, expiresAt } = result.quote ?? {
    debitAmount:   null,
    receiveAmount: null,
    expiresAt:     undefined,
  };

  const topUpDisplay = debitAmount
    ? formatMoney(debitAmount.value, debitAmount.assetCode, debitAmount.assetScale)
    : formatRands(result.topUpCents);

  const receiveDisplay = receiveAmount
    ? formatMoney(receiveAmount.value, receiveAmount.assetCode, receiveAmount.assetScale)
    : formatRands(result.topUpCents);

  // Build per-voucher contribution rows
  const contributionRows = result.contributions.map(c => `
    <div class="split-row">
      <span class="split-label">
        ${c.label} <span class="split-badge split-badge-voucher">voucher</span>
      </span>
      <span class="split-value-voucher">−${formatRands(c.deductCents)}</span>
    </div>
  `).join('');

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
        <h2 class="pay-title">Payment breakdown</h2>
        <p class="pay-subtitle">Review how this payment at <strong>${escapeHtml(result.merchant)}</strong> will be split before authorising.</p>
      </div>

      <div class="split-breakdown">
        <div class="split-row">
          <span class="split-label">Purchase total</span>
          <span class="split-value-total">${formatRands(purchaseAmountCents)}</span>
        </div>
        ${contributionRows}
        ${result.requiresTopUp ? `
          <div class="split-row">
            <span class="split-label">
              Wallet top-up <span class="split-badge split-badge-wallet">ILP</span>
            </span>
            <span class="split-value-wallet">${topUpDisplay}</span>
          </div>
          <div class="split-row split-total">
            <span>Merchant receives</span>
            <span>${receiveDisplay}</span>
          </div>
        ` : `
          <div class="split-row split-total">
            <span>Vouchers cover everything 🎉</span>
            <span class="split-value-voucher">R0.00 from wallet</span>
          </div>
        `}
      </div>

      ${expiresAt ? `
        <p class="muted">Quote expires at <strong>${new Date(expiresAt).toLocaleTimeString()}</strong></p>
      ` : ''}

      ${result.requiresTopUp ? `
        <p class="muted">
          Clicking <strong>Authorise</strong> will redirect you to your wallet's consent page to approve the
          <strong>${topUpDisplay}</strong> top-up. You'll return here automatically.
        </p>
      ` : `
        <p class="muted">
          Your vouchers cover the full amount — no wallet payment needed.
          Click <strong>Confirm</strong> to complete the purchase.
        </p>
      `}

      <div id="consent-error" class="error-msg" hidden></div>

      <div class="btn-row">
        <button class="btn btn-secondary" id="back-btn">← Back</button>
        <button class="btn btn-africa-primary" id="consent-btn">
          ${result.requiresTopUp ? 'Authorise top-up' : 'Confirm payment'}
        </button>
      </div>
    </div>
  `;

  container.querySelector('#back-btn')!.addEventListener('click', onBack);

  const btn    = container.querySelector<HTMLButtonElement>('#consent-btn')!;
  const errDiv = container.querySelector<HTMLDivElement>('#consent-error')!;

  btn.addEventListener('click', async () => {
    btn.disabled    = true;
    btn.textContent = result.requiresTopUp ? 'Redirecting…' : 'Confirming…';
    errDiv.hidden   = true;

    try {
      if (!result.requiresTopUp) {
        // Voucher-only — already deducted in /api/pay/quote; go straight to success
        window.location.hash = '#/pay-success';
        return;
      }
      const { interactUrl } = await api.consent(result.transactionId!);
      window.location.href = interactUrl;
    } catch (err: unknown) {
      const msg          = err instanceof Error ? err.message : String(err);
      errDiv.textContent = msg;
      errDiv.hidden      = false;
      btn.disabled       = false;
      btn.textContent    = result.requiresTopUp ? 'Authorise top-up' : 'Confirm payment';
    }
  });
}
