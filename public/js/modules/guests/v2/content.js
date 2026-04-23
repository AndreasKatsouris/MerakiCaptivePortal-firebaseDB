// Scripted Guests content — Phase A3 placeholder.
// Shape matches eventual RTDB queries against guests/{guestId} +
// guestVisitsIndex/byGuest/{guestId}. ZAR amounts for SA-locale.

export const GUEST_LIST_TOTAL = 12480

export const GUEST_LIST_FILTERS = [
  { id: 'vip',      label: 'VIP',      active: true  },
  { id: 'lapsed',   label: 'Lapsed',   active: false },
  { id: 'new',      label: 'New',      active: false },
  { id: 'birthday', label: 'Birthday', active: false },
  { id: 'all',      label: 'All',      active: false },
]

export const GUESTS = [
  { id: 'ef', initials: 'EF', name: 'Elena Foster',     summary: 'VIP · 22 visits · Ocean Club' },
  { id: 'jr', initials: 'JR', name: 'James Rivera',     summary: 'Lapsed 94d · R33,600 LTV'     },
  { id: 'ap', initials: 'AP', name: 'Ava Patel',        summary: 'New · 1st visit Mar 28'       },
  { id: 'mk', initials: 'MK', name: 'Marco Kim',        summary: 'Birthday Fri · VIP'           },
  { id: 'sh', initials: 'SH', name: 'Sara Haque',       summary: 'VIP · 18 visits'              },
  { id: 'lb', initials: 'LB', name: 'Liam Brennan',     summary: 'Lapsed 60d'                   },
  { id: 'rn', initials: 'RN', name: 'Rafael Nuñez',     summary: 'Regular · 9 visits'           },
  { id: 'io', initials: 'IO', name: 'Imani Okonkwo',    summary: 'Birthday Sun · 4 visits'      },
]

export const GUEST_PROFILES = {
  ef: {
    id: 'ef',
    initials: 'EF',
    name: 'Elena Foster',
    tone: '#e7d9be',
    chip: { tone: 'accent', label: 'VIP', icon: 'star' },
    memberSince: 'Member since Mar 2023',
    email: 'elena.f@studio.com',
    phone: '(415) 555-0182',
    venueNote: 'Ocean Club regular · Vault occasional',
    kpis: [
      { key: 'lifetime',  label: 'Lifetime',   value: 'R88,300',  meta: '87th percentile' },
      { key: 'visits',    label: 'Visits',     value: '22',       meta: 'every 17 days avg' },
      { key: 'lastVisit', label: 'Last visit', value: '8d ago',   meta: 'Apr 14 · Dinner' },
      { key: 'avgCheck',  label: 'Avg check',  value: 'R3,940',   meta: '+R620 vs. house' },
    ],
    // 24 weeks of visits — 0/1 with one 2-visit week at index 22 as accent.
    visitRhythm: [
      { x: 'W1',  y: 0 }, { x: 'W2',  y: 1 }, { x: 'W3',  y: 1 }, { x: 'W4',  y: 0 },
      { x: 'W5',  y: 1 }, { x: 'W6',  y: 1 }, { x: 'W7',  y: 0 }, { x: 'W8',  y: 1 },
      { x: 'W9',  y: 1 }, { x: 'W10', y: 0 }, { x: 'W11', y: 1 }, { x: 'W12', y: 1 },
      { x: 'W13', y: 0 }, { x: 'W14', y: 1 }, { x: 'W15', y: 1 }, { x: 'W16', y: 1 },
      { x: 'W17', y: 0 }, { x: 'W18', y: 1 }, { x: 'W19', y: 1 }, { x: 'W20', y: 1 },
      { x: 'W21', y: 1 }, { x: 'W22', y: 1 }, { x: 'W23', y: 2 }, { x: 'W24', y: 1 },
    ],
    visitRhythmAccentIndex: 22,
    recentVisits: [
      { date: 'Apr 14', venue: 'Ocean Club', label: 'Dinner · 2 guests', amount: 'R3,300', note: 'Loved the duck confit — server note' },
      { date: 'Apr 02', venue: 'Ocean Club', label: 'Dinner · 4 guests', amount: 'R7,420', note: 'Birthday dinner · partner James' },
      { date: 'Mar 21', venue: 'The Vault',  label: 'Cocktails · 2',     amount: 'R1,720', note: null },
      { date: 'Mar 08', venue: 'Ocean Club', label: 'Dinner · 2',        amount: 'R3,560', note: null },
      { date: 'Feb 24', venue: 'Ocean Club', label: 'Brunch · 3',        amount: 'R2,560', note: null },
    ],
    ross: {
      headline: 'Likely to respond to a wine tasting invite.',
      detail:
        "Orders wine pairings on 80% of visits. Mentioned \"natural wine\" in server notes on 2 of the last 3. " +
        "The Apr 28 tasting is a strong match.",
      action: 'Draft invite',
    },
    preferences: [
      'Window table', 'No cilantro', 'Natural wine', 'Birthday · Oct 14',
      'Partner: James', 'Pet-friendly', 'Quiet seating',
    ],
    allergies: {
      primary: 'Shellfish allergy',
      detail: 'Flag for all visits. Last confirmed Mar 2024.',
    },
    relationships: [
      { initials: 'JR', name: 'James Rivera', relation: 'partner · 9 joint visits' },
      { initials: 'MK', name: 'Marco Kim',    relation: 'colleague · 3 visits' },
    ],
  },
}
