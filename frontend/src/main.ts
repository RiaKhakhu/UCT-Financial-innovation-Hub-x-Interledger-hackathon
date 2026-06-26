import './styles.css';
import { isLoggedIn } from './auth';
import { api, User } from './api';
import type { PayQuoteResponse } from './api';
import { renderHomeView }       from './views/homeView';
import { renderLoginView }      from './views/loginView';
import { renderSignupView }     from './views/signupView';
import { renderProfileView }    from './views/profileView';
import { renderHistoryView }    from './views/historyView';
import { renderPayView }        from './views/payView';
import { renderPayConsentView } from './views/payConsentView';
import { renderPaySuccessView } from './views/paySuccessView';
import { renderStatusView }     from './views/statusView';
import { renderVouchersView }   from './views/vouchersView';

const view     = document.getElementById('view')!;
const nav      = document.getElementById('main-nav')!;
const navLinks = nav.querySelectorAll<HTMLAnchorElement>('.nav-link');

// ─── State ────────────────────────────────────────────────────────────────────

interface PendingPay {
  result:              PayQuoteResponse;
  purchaseAmountCents: number;
}

let pendingPay:  PendingPay | null = null;
let cachedUser:  User | null       = null;

// ─── Nav helpers ──────────────────────────────────────────────────────────────

function updateNav(route: string): void {
  nav.hidden = !isLoggedIn();
  navLinks.forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route);
  });
}

// ─── Pay sub-views ────────────────────────────────────────────────────────────

function showPayConsent(): void {
  if (!pendingPay) { window.location.hash = '#/pay'; return; }
  renderPayConsentView(
    view,
    pendingPay.result,
    pendingPay.purchaseAmountCents,
    () => { if (cachedUser) showPay(cachedUser); }
  );
}

function showStatus(id: string): void {
  renderStatusView(view, id);
}

async function showPay(user: User): Promise<void> {
  await renderPayView(view, user, (result: PayQuoteResponse) => {
    const purchaseAmountCents = result.voucherCovers + result.topUpCents;
    pendingPay = { result, purchaseAmountCents };
    showPayConsent();
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function route(): Promise<void> {
  // GNAP callback: ?id=<uuid> takes priority over hash
  const params   = new URLSearchParams(window.location.search);
  const returnId = params.get('id');
  if (returnId) {
    history.replaceState({}, '', window.location.pathname + '#/status');
    updateNav('');
    showStatus(returnId);
    return;
  }

  const hash = window.location.hash || '#/';
  const path = hash.slice(1);
  const segment = path.split('/')[1] ?? '';
  updateNav(segment);

  // Public routes
  if (path === '/' || path === '') { renderHomeView(view); return; }
  if (path === '/login')           { renderLoginView(view); return; }
  if (path === '/signup')          { renderSignupView(view); return; }

  // Protected routes
  if (!isLoggedIn()) { window.location.hash = '#/login'; return; }

  if (!cachedUser) {
    try {
      cachedUser = await api.auth.me();
    } catch {
      window.location.hash = '#/login';
      return;
    }
  }

  // Sentinel — status was already rendered; on back/forward go home
  if (path === '/status') { window.location.hash = '#/'; return; }

  if (path === '/pay') {
    pendingPay = null;
    await showPay(cachedUser);
    return;
  }
  if (path === '/pay-consent') {
    showPayConsent();
    return;
  }
  if (path === '/pay-success') {
    updateNav('');
    renderPaySuccessView(view);
    return;
  }
  if (path === '/history') {
    await renderHistoryView(view);
    return;
  }
  if (path === '/vouchers') {
    await renderVouchersView(view);
    return;
  }
  if (path === '/profile') {
    await renderProfileView(view);
    return;
  }

  // Fallback
  window.location.hash = '#/';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => {
  cachedUser = null;
  route();
});

route();
