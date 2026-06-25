import { isLoggedIn } from '../auth';

const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const icons = {
  ticket:  `<svg ${SVG_ATTRS}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>`,
  wallet:  `<svg ${SVG_ATTRS}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  zap:     `<svg ${SVG_ATTRS}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  shield:  `<svg ${SVG_ATTRS}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
};

export function renderHomeView(container: HTMLElement): void {
  if (isLoggedIn()) {
    renderDashboardHome(container);
  } else {
    renderPublicHome(container);
  }
}

function renderDashboardHome(container: HTMLElement): void {
  container.innerHTML = `
    <div class="home-logged-in">
      <div class="home-hero-band">
        <h1 class="home-hero-title">Pay with your voucher.</h1>
        <h1 class="home-hero-title home-hero-title-blue">Top up with your wallet.</h1>
        <p class="home-hero-body">
          Got a voucher that doesn't quite cover it?<br />
          Voucher2 bridges the gap — one seamless payment.
        </p>
        <div class="home-hero-cta-row">
          <a href="#/pay"     class="btn btn-africa-primary">Pay now →</a>
          <a href="#/history" class="btn btn-secondary">View history</a>
        </div>
      </div>

      <div class="home-pillars">
        <div class="home-pillar">
          <span class="home-pillar-icon">${icons.ticket}</span>
          <div>
            <div class="home-pillar-label">Any voucher</div>
            <div class="home-pillar-text">Store cards, gift vouchers, prepaid cards — just enter the code.</div>
          </div>
        </div>
        <div class="home-pillar">
          <span class="home-pillar-icon">${icons.wallet}</span>
          <div>
            <div class="home-pillar-label">ILP wallet top-up</div>
            <div class="home-pillar-text">Your Interledger wallet covers any remainder, automatically quoted in ZAR.</div>
          </div>
        </div>
        <div class="home-pillar">
          <span class="home-pillar-icon">${icons.zap}</span>
          <div>
            <div class="home-pillar-label">One authorisation</div>
            <div class="home-pillar-text">What was two payments is now one — approve once and you're done.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPublicHome(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card hero">
      <div class="hero-africa-tag">${icons.shield} Powered by Interledger</div>
      <h1>Stop overpaying for under-covered vouchers</h1>
      <p class="hero-sub">
        Voucher2 combines your voucher balance with your ILP wallet into a single,
        seamless payment. No more two-step checkout.
      </p>
      <div class="hero-actions">
        <a href="#/signup" class="btn btn-primary">Get started</a>
        <a href="#/login"  class="btn btn-secondary">Log in</a>
      </div>
      <div class="hero-features">
        <div class="feature">
          <span class="feature-icon">${icons.ticket}</span>
          <span>Any voucher</span>
        </div>
        <div class="feature">
          <span class="feature-icon">${icons.wallet}</span>
          <span>ILP top-up</span>
        </div>
        <div class="feature">
          <span class="feature-icon">${icons.zap}</span>
          <span>One payment</span>
        </div>
      </div>
    </div>
  `;
}
