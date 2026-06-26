import { api, VoucherInfo } from '../api';
import { escapeHtml } from '../escape';

const TICKET_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="20" height="20">
  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
</svg>`;

function formatRands(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}

function totalBalance(vouchers: VoucherInfo[]): number {
  return vouchers.reduce((sum, v) => sum + v.balanceCents, 0);
}

function groupByProvider(vouchers: VoucherInfo[]): Map<string, VoucherInfo[]> {
  const map = new Map<string, VoucherInfo[]>();
  for (const v of vouchers) {
    if (!map.has(v.provider)) map.set(v.provider, []);
    map.get(v.provider)!.push(v);
  }
  return map;
}

function voucherRowHtml(v: VoucherInfo): string {
  return `
    <div class="wallet-voucher-row" data-id="${escapeHtml(v.id)}">
      <div class="wallet-voucher-icon">${TICKET_SVG}</div>
      <div class="wallet-voucher-info">
        <span class="wallet-voucher-label">${escapeHtml(v.label)}</span>
        <span class="wallet-voucher-code">${escapeHtml(v.code)}</span>
      </div>
      <span class="wallet-voucher-balance">${formatRands(v.balanceCents)}</span>
    </div>
  `;
}

function providerSectionHtml(provider: string, items: VoucherInfo[]): string {
  const subtotal = items.reduce((s, v) => s + v.balanceCents, 0);
  return `
    <div class="wallet-provider-section">
      <div class="wallet-provider-header">
        <span class="wallet-provider-name">${escapeHtml(provider)}</span>
        <span class="wallet-provider-subtotal">${formatRands(subtotal)}</span>
      </div>
      ${items.map(voucherRowHtml).join('')}
    </div>
  `;
}

export async function renderVouchersView(container: HTMLElement): Promise<void> {
  container.innerHTML = `<div class="card"><div class="spinner"></div></div>`;

  let myVouchers: VoucherInfo[] = [];
  let providers: string[] = [];

  try {
    [myVouchers, providers] = await Promise.all([
      api.pay.myVouchers(),
      api.pay.providers(),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="card"><p class="error-msg">Failed to load vouchers.</p></div>`;
    return;
  }

  const grouped = groupByProvider(myVouchers);
  const total   = totalBalance(myVouchers);

  const walletSection = myVouchers.length === 0
    ? `<p class="muted" style="text-align:center;padding:1rem 0">
         No vouchers loaded yet. Use the form below to add one.
       </p>`
    : `
      <div class="wallet-total-bar">
        <span class="wallet-total-label">Total available</span>
        <span class="wallet-total-value">${formatRands(total)}</span>
      </div>
      ${[...grouped.entries()].map(([p, vs]) => providerSectionHtml(p, vs)).join('')}
    `;

  container.innerHTML = `
    <div class="vouchers-page">
      <div class="vouchers-page-header">
        <h2 class="vouchers-page-title">My Vouchers</h2>
        <p class="vouchers-page-sub">Loaded vouchers are auto-combined at checkout to cover as much as possible.</p>
      </div>

      <div class="card wallet-card">
        ${walletSection}
      </div>

      <div class="card">
        <div class="vouchers-load-header">
          <h3 class="vouchers-load-title">Load a voucher</h3>
          <p class="muted">Select the provider and enter the voucher code exactly as printed.</p>
        </div>

        <form id="load-form" novalidate>
          <div class="field" style="margin-bottom:1rem">
            <label for="load-provider">Provider</label>
            <select id="load-provider" class="input">
              <option value="">— Select provider —</option>
              ${providers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
            </select>
          </div>

          <div class="field" style="margin-bottom:1rem">
            <label for="load-code">Voucher code</label>
            <input
              id="load-code"
              type="text"
              class="input"
              placeholder="e.g. PICK-1234-ABCD"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
            />
          </div>

          <div id="load-error"   class="error-msg"   hidden></div>
          <div id="load-success" class="success-msg" hidden></div>

          <button type="submit" class="btn btn-primary" id="load-btn">Load voucher</button>
        </form>

        <div class="demo-hint" style="margin-top:1rem">
          <strong>Demo pool codes you can load:</strong>
          <ul class="demo-voucher-list">
            <li>PICK-1234-ABCD (Checkers R100)</li>
            <li>PICK-2345-BCDE (Checkers R50)</li>
            <li>WOOL-5678-EFGH (Woolworths R200)</li>
            <li>SPAR-9012-IJKL (SPAR R50)</li>
            <li>GAME-7890-QRST (Game Stores R500)</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  const form        = container.querySelector<HTMLFormElement>('#load-form')!;
  const loadBtn     = container.querySelector<HTMLButtonElement>('#load-btn')!;
  const errDiv      = container.querySelector<HTMLDivElement>('#load-error')!;
  const successDiv  = container.querySelector<HTMLDivElement>('#load-success')!;
  const providerSel = container.querySelector<HTMLSelectElement>('#load-provider')!;
  const codeInput   = container.querySelector<HTMLInputElement>('#load-code')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errDiv.hidden     = true;
    successDiv.hidden = true;

    const provider = providerSel.value.trim();
    const code     = codeInput.value.trim().toUpperCase();

    if (!provider) {
      errDiv.textContent = 'Please select a provider.';
      errDiv.hidden = false;
      return;
    }
    if (!code) {
      errDiv.textContent = 'Please enter a voucher code.';
      errDiv.hidden = false;
      return;
    }

    loadBtn.disabled    = true;
    loadBtn.textContent = 'Loading…';

    try {
      const v = await api.pay.load({ provider, code });
      successDiv.textContent = `✓ ${v.label} (${formatRands(v.balanceCents)}) added to your wallet!`;
      successDiv.hidden = false;
      codeInput.value   = '';
      providerSel.value = '';
      // Reload the page section to show the new voucher
      await renderVouchersView(container);
    } catch (err: unknown) {
      errDiv.textContent = err instanceof Error ? err.message : String(err);
      errDiv.hidden = false;
    } finally {
      loadBtn.disabled    = false;
      loadBtn.textContent = 'Load voucher';
    }
  });
}
