// Shown when the voucher fully covers the purchase (no ILP top-up needed)
export function renderPaySuccessView(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card send-card">
      <div class="step-indicator">
        <div class="step-dot done">✓</div>
        <div class="step-line done"></div>
        <div class="step-dot done">✓</div>
        <div class="step-line done"></div>
        <div class="step-dot done">✓</div>
      </div>

      <div class="status-terminal">
        <div class="status-success-row">
          <div class="status-success-icon">✓</div>
          <h3 class="status-complete-title">Payment complete!</h3>
        </div>
        <div class="quote-summary">
          <div class="summary-row">
            <span class="label">Method</span>
            <span class="value">Voucher (no top-up needed)</span>
          </div>
        </div>
        <p class="muted">Your voucher balance has been updated. Start a new payment any time.</p>
        <a href="#/pay" class="btn btn-africa-primary">New payment</a>
        <a href="#/history" class="btn btn-secondary">View history</a>
      </div>
    </div>
  `;
}
