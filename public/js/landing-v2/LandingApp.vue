<script setup>
// Sparks Hi-Fi marketing landing — page content.
// Layout classes (.lp-*) live in /css/landing-page-v2.css. Visual primitives
// (button, card, chip, icon) come from the Hi-Fi Vue component library so we
// inherit any future design-system updates instead of forking the styles.
//
// Marketing copy mirrors public/index.html. Copy changes belong in a
// separate content PR, not this refactor.

const features = [
  { icon: 'sparkle', title: 'Smart Guest WiFi',     body: 'Transform your WiFi into a powerful engagement tool. Capture guest data, build relationships, and drive repeat visits automatically.' },
  { icon: 'line',    title: 'Real-Time Analytics',  body: 'Make data-driven decisions with instant insights into guest behavior, peak hours, and revenue trends.' },
  { icon: 'cart',    title: 'Food Cost Control',    body: 'Optimize inventory, reduce waste, and maximize profits with AI-powered cost management and predictive ordering.' },
  { icon: 'send',    title: 'Marketing Automation', body: 'Engage guests with personalized campaigns, loyalty programs, and targeted offers based on their preferences.' },
  { icon: 'users',   title: 'Team Management',      body: 'Streamline scheduling, track performance, and empower your staff with the tools they need to excel.' },
  { icon: 'chart',   title: 'Mobile Dashboard',     body: 'Monitor and manage your restaurant from anywhere with our intuitive mobile-first design.' },
]

const stats = [
  { num: '10x', label: 'Efficiency increase' },
  { num: '83%', label: 'Reduction in waste' },
  { num: '4.8', label: 'Customer rating' },
  { num: '52%', label: 'Increase in revenue' },
]

const quotes = [
  {
    body: 'My father, Lakis Katsouris, served people all his life from a young age. As an entrepreneur, he understood that hospitality is about creating moments that matter. Sparks Hospitality carries forward his belief that technology should amplify human connection, not replace it.',
    initials: 'LK', name: 'Founder’s Story', role: 'The Katsouris Legacy',
  },
  {
    body: 'Sparks transformed how we operate. The WiFi engagement alone increased our repeat visits by 40%. It’s like having a dedicated team working around the clock.',
    initials: 'MR', name: 'Maria Rodriguez', role: 'Owner, Bella Vista',
  },
  {
    body: 'The food cost system is a game-changer. We’ve reduced waste by 30% and our margins have never been better. The predictive ordering is incredibly accurate.',
    initials: 'JC', name: 'James Chen', role: 'Executive Chef',
  },
]

const successStories = [
  { eyebrow: 'Multi-site',  title: 'Ocean Basket Group', body: '15 locations saw a 25% increase in retention and a 35% boost in campaign effectiveness within 3 months.' },
  { eyebrow: 'Independent', title: 'The Garden Bistro',  body: 'Menu optimization based on guest insights led to a 28% revenue increase in just 90 days.' },
  { eyebrow: 'Community',   title: 'Mama’s Kitchen', body: 'Built a community of 5,000+ loyal guests with automated engagement and personalized rewards.' },
]

function smoothScroll(e, selector) {
  if (selector === '#') return
  const target = document.querySelector(selector)
  if (target) {
    e.preventDefault()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>

<template>
  <div class="lp-shell">
    <!-- Navigation -->
    <nav class="lp-nav">
      <div class="lp-nav__inner">
        <a href="#" class="lp-logo" aria-label="Sparks Hospitality" @click="smoothScroll($event, '#')">
          <svg class="lp-logo__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="var(--hf-ink)" />
          </svg>
          <span class="lp-logo__text">Sparks</span>
        </a>
        <ul class="lp-nav__menu">
          <li><a href="#features"     class="lp-nav__link" @click="smoothScroll($event, '#features')">Platform</a></li>
          <li><a href="#about"        class="lp-nav__link" @click="smoothScroll($event, '#about')">Our Story</a></li>
          <li><a href="#testimonials" class="lp-nav__link" @click="smoothScroll($event, '#testimonials')">Case Studies</a></li>
          <li><a href="/user-login.html" class="lp-nav__link">Login</a></li>
          <li>
            <hf-button as="a" variant="accent" href="/signup.html">Get Started</hf-button>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Hero -->
    <section class="lp-hero lp-section">
      <div class="lp-container">
        <div class="lp-hero__inner">
          <div>
            <div class="lp-hero__eyebrow">
              <hf-chip tone="accent">Inspired by service</hf-chip>
            </div>
            <h1 class="lp-hero__title">
              Restaurant management,
              <span class="lp-hero__title-accent">infinite scale.</span>
            </h1>
            <p class="lp-hero__lede">
              Sparks Hospitality amplifies what your team can do by effortlessly scaling
              your restaurant operations. So you can focus on what matters most &mdash;
              creating exceptional guest experiences.
            </p>
            <div class="lp-hero__ctas">
              <hf-button as="a" href="/signup.html">
                Get Started
                <template #trailing>
                  <hf-icon name="arrow" :size="14" />
                </template>
              </hf-button>
              <hf-button as="a" variant="ghost" href="#demo" @click="smoothScroll($event, '#demo')">
                Watch Demo
              </hf-button>
            </div>
          </div>
          <div class="lp-hero__media">
            <img src="/img/ob-bg.jpg" alt="Restaurant Management Dashboard" loading="eager" />
          </div>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="lp-section lp-section--paper">
      <div class="lp-container">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">Scaling your operations</span>
          <h2 class="lp-section__title">Extra capacity at superhuman scale</h2>
          <p class="lp-section__lede">Our platform enables your team to go further, faster.</p>
        </header>
        <div class="lp-stats">
          <div v-for="s in stats" :key="s.label" class="lp-stat">
            <div class="lp-stat__num">{{ s.num }}</div>
            <div class="lp-stat__label">{{ s.label }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="lp-section" id="features">
      <div class="lp-container">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">The Sparks stack</span>
          <h2 class="lp-section__title">Sits at the heart of your operations</h2>
          <p class="lp-section__lede">Unprecedented management power at unlimited scale.</p>
        </header>
        <div class="lp-grid">
          <hf-card v-for="f in features" :key="f.title">
            <template #header>
              <div class="lp-feature__icon" aria-hidden="true">
                <hf-icon :name="f.icon" :size="20" />
              </div>
              <h3 class="lp-card-title">{{ f.title }}</h3>
            </template>
            <p class="lp-card-body">{{ f.body }}</p>
          </hf-card>
        </div>
      </div>
    </section>

    <!-- About / Inspiration -->
    <section class="lp-section lp-section--sand" id="about">
      <div class="lp-container">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">Inspired by service</span>
          <h2 class="lp-section__title">A legacy that guides everything we do</h2>
        </header>
        <div class="lp-quotes">
          <article v-for="q in quotes" :key="q.initials" class="lp-quote">
            <div class="lp-quote__mark" aria-hidden="true">&ldquo;</div>
            <p class="lp-quote__body">{{ q.body }}</p>
            <div class="lp-quote__author">
              <div class="lp-quote__avatar">{{ q.initials }}</div>
              <div>
                <p class="lp-quote__name">{{ q.name }}</p>
                <p class="lp-quote__role">{{ q.role }}</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Success at scale -->
    <section class="lp-section" id="testimonials">
      <div class="lp-container">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">Success at scale</span>
          <h2 class="lp-section__title">Real results from real operators</h2>
          <p class="lp-section__lede">Restaurants transforming their operations with Sparks.</p>
        </header>
        <div class="lp-grid">
          <hf-card v-for="s in successStories" :key="s.title" :eyebrow="s.eyebrow" :title="s.title">
            <p class="lp-card-body">{{ s.body }}</p>
          </hf-card>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="lp-section lp-section--ink">
      <div class="lp-container">
        <div class="lp-cta">
          <h2 class="lp-cta__title">Give your team superhuman powers</h2>
          <p class="lp-cta__lede">Join the hospitality revolution with a 30-day free trial.</p>
          <hf-button as="a" variant="accent" href="/signup.html">
            Get Started Free
            <template #trailing>
              <hf-icon name="arrow" :size="14" />
            </template>
          </hf-button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="lp-footer">
      <div class="lp-footer__inner">
        <div class="lp-footer__links">
          <a href="#features"     @click="smoothScroll($event, '#features')">Platform</a>
          <a href="#about"        @click="smoothScroll($event, '#about')">Our Story</a>
          <a href="#testimonials" @click="smoothScroll($event, '#testimonials')">Case Studies</a>
          <a href="/terms.html">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/admin-login.html">Admin</a>
        </div>
        <div class="lp-footer__social">
          <a href="#" aria-label="Facebook">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 22v-9h3l1-4h-4V6.5c0-1.2.4-2 2-2h2V1.2C16.6 1.1 15.4 1 14.1 1 11.4 1 9.5 2.7 9.5 5.7V9h-3v4h3v9h3.5Z" />
            </svg>
          </a>
          <a href="#" aria-label="Twitter">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.9 6.3a7.6 7.6 0 0 1-2.2.6 3.8 3.8 0 0 0 1.7-2.1 7.6 7.6 0 0 1-2.4.9 3.8 3.8 0 0 0-6.5 3.5A10.7 10.7 0 0 1 1.7 5.3a3.8 3.8 0 0 0 1.2 5.1 3.7 3.7 0 0 1-1.7-.5v.1a3.8 3.8 0 0 0 3 3.7 3.8 3.8 0 0 1-1.7.1 3.8 3.8 0 0 0 3.5 2.7A7.6 7.6 0 0 1 1 18a10.7 10.7 0 0 0 5.8 1.7c7 0 10.8-5.8 10.8-10.8v-.5a7.7 7.7 0 0 0 1.9-2Z" />
            </svg>
          </a>
          <a href="#" aria-label="LinkedIn">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5.4 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-1.7 5.6h3.4V21H3.7V9.1ZM10 9.1h3.3V11h.1c.5-.9 1.7-1.9 3.5-1.9 3.7 0 4.4 2.4 4.4 5.6V21h-3.4v-5.6c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21H10V9.1Z" />
            </svg>
          </a>
          <a href="#" aria-label="Instagram">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
            </svg>
          </a>
        </div>
        <p class="lp-footer__legal">&copy; 2026 Sparks Hospitality &middot; In honour of Lakis Katsouris</p>
      </div>
    </footer>
  </div>
</template>
