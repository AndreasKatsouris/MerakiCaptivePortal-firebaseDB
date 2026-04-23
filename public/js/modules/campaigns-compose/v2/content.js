// Scripted Campaigns-Compose content — Phase A6.
// Shape matches eventual RTDB + Ross service composition: segments from
// guestSegmentsIndex/{segmentId}, message templates from
// campaignTemplates, projection from the forecast engine.

export const HEADER = {
  eyebrow: 'Campaigns · drafted by Ross',
  title: 'Win back your VIPs.',
  actions: [
    { id: 'discard',    label: 'Discard',        variant: 'ghost' },
    { id: 'save',       label: 'Save draft',     variant: 'solid' },
    { id: 'review',     label: 'Review & send',  variant: 'solid',  icon: 'send' },
  ],
}

export const AUDIENCE = {
  count: 42,
  name: 'Lapsed VIPs',
  criteria: 'Visits ≥ 5 · Last visit > 90 days · LTV > R27,000',
  previewAvatars: ['EF','JR','MK','SH','LB','AP'],
  overflowCount: 36,
  editLink: 'edit segment',
}

export const MESSAGE = {
  channels: [
    { id: 'email',    label: 'Email',    active: true  },
    { id: 'sms',      label: 'SMS',      active: false },
    { id: 'whatsapp', label: 'WhatsApp', active: false },
  ],
  subjectParts: [
    { type: 'token', value: '{First name}' },
    { type: 'text',  value: ', we saved you a seat.' },
  ],
  // Rich body stored as typed paragraph fragments so we never use v-html.
  body: [
    {
      type: 'p',
      parts: [
        { type: 'text', value: "It's been a while since we poured a glass with you at Ocean Club. " },
        { type: 'text', value: "Chef Marco just finished the spring menu, and there's a natural-wine tasting on " },
        { type: 'strong', value: 'April 28' },
        { type: 'text', value: ' that felt like it had your name on it.' },
      ],
    },
    {
      type: 'p',
      parts: [
        { type: 'text', value: "Six pairings, a small room, 28 seats. We'd love to hold one for you." },
      ],
    },
    {
      type: 'p',
      italic: true,
      muted: true,
      parts: [
        { type: 'text', value: '— Marco and the Ocean Club team' },
      ],
    },
  ],
  ctaButtons: [
    { id: 'reserve',  label: 'Reserve my seat →', variant: 'solid' },
    { id: 'seeMenu',  label: 'See the menu',      variant: 'ghost' },
  ],
  rossTools: [
    { id: 'personalize', label: 'Personalize further', icon: 'sparkle' },
    { id: 'shorten',     label: 'Shorten',             icon: 'sparkle' },
    { id: 'translate',   label: 'Translate',           icon: 'sparkle' },
    { id: 'ab',          label: 'A/B test subject',    icon: null     },
  ],
}

export const TIMING = {
  headline: 'Thursday · 9:20 AM',
  caption: '↑ 38% projected open · Ross-optimal window',
  options: [
    { id: 'ross',   label: 'Ross pick', tone: 'accent', active: true  },
    { id: 'custom', label: 'Custom',    tone: 'default', active: false },
    { id: 'now',    label: 'Send now',  tone: 'default', active: false },
  ],
}

export const PROJECTED_IMPACT = [
  { key: 'openRate',  value: '38%',    caption: 'open rate',           tone: 'default' },
  { key: 'responses', value: '16',     caption: 'likely responses',    tone: 'default' },
  { key: 'bookings',  value: '12',     caption: 'expected bookings',   tone: 'default' },
  { key: 'revenue',   value: 'R93,600',caption: 'projected revenue',   tone: 'good'    },
]

export const ROSS_NOTES = [
  '14 of 42 have wine-pairing attach > 70%',
  '8 celebrated birthdays in the last 60d — tone should feel personal, not promotional',
  'Avoid Mondays — this cohort opens 22% less',
]

export const RECENT_CAMPAIGNS = [
  { id: 'spring', name: 'Spring menu launch', sent: '312 sent',    result: '44% · R146k', tone: 'good' },
  { id: 'easter', name: 'Easter brunch',      sent: '186 sent',    result: '29% · R43.2k', tone: 'ink'  },
  { id: 'wine',   name: 'Wine club recruit',  sent: '94 sent',     result: '18% · R16.6k', tone: 'warn' },
]
