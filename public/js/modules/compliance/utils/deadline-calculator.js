/**
 * Deadline Calculator — Corporate Compliance Module
 *
 * Converts obligation `deadlineRule` strings into concrete Date objects
 * for a given year, and provides helpers for formatting and status logic.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YEAR_END_RELATIVE_RULES = new Set([
  '6_months_after_tax_year_start',
  'last_day_of_financial_year',
  '6_months_after_financial_year_end',
  '12_months_after_financial_year_end',
  'aligned_to_financial_year_end'
]);

const MANUAL_RULES = new Set([
  'manual',
  'per_entity_licence_expiry',
  'per_entity_inspection_anniversary'
]);

const DATE_FORMAT_OPTIONS = { day: 'numeric', month: 'short', year: 'numeric' };

/** Approximate calendar-day equivalent of 30 business days */
const BUSINESS_DAYS_30_AS_CALENDAR = 42;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a "MM-DD" string into month (0-indexed) and day.
 * @param {string} fixedDeadline — e.g. "03-31"
 * @returns {{ month: number, day: number } | null}
 */
function parseFixedDeadline(fixedDeadline) {
  if (!fixedDeadline || typeof fixedDeadline !== 'string') return null;

  const parts = fixedDeadline.split('-');
  if (parts.length !== 2) return null;

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  if (isNaN(month) || isNaN(day)) return null;

  return { month: month - 1, day };
}

/**
 * Parse a financial year-end string (expected "MM" or "MM-DD" or a month name)
 * and return the last day of that financial year-end month for a given year.
 * @param {string|number|null} financialYearEnd
 * @param {number} year
 * @returns {Date|null}
 */
function parseFinancialYearEnd(financialYearEnd, year) {
  if (!financialYearEnd) return null;

  const raw = String(financialYearEnd).trim();

  // Try "MM-DD" format
  if (raw.includes('-')) {
    const parsed = parseFixedDeadline(raw);
    if (parsed) {
      return new Date(year, parsed.month, parsed.day);
    }
  }

  // Try pure numeric month (e.g. "02" for February)
  const monthNum = parseInt(raw, 10);
  if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
    // Last day of that month
    return new Date(year, monthNum, 0);
  }

  return null;
}

/**
 * Add a number of months to a date, returning a new Date.
 * @param {Date} date
 * @param {number} months
 * @returns {Date}
 */
function addMonths(date, months) {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Get the last day of a given month/year.
 * @param {number} year
 * @param {number} month — 0-indexed
 * @returns {Date}
 */
function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0);
}

/**
 * Get the financial year-end date for an entity in a given calendar year.
 * Returns null if financialYearEnd is not set or invalid.
 * @param {Object|null} entity
 * @param {number} year
 * @returns {Date|null}
 */
function getEntityYearEnd(entity, year) {
  const fye = entity && entity.financialYearEnd;
  if (!fye) return null;
  const parsed = new Date(fye);
  if (isNaN(parsed.getTime())) return null;
  return new Date(year, parsed.getMonth(), parsed.getDate());
}

/**
 * Calculate a deadline N calendar days after the entity's incorporation anniversary in a given year.
 * @param {Object|null} entity
 * @param {number} year
 * @param {number} calendarDaysAfter
 * @returns {Date|null}
 */
function calculateAnniversaryDeadline(entity, year, calendarDaysAfter) {
  const incDate = entity && entity.incorporationDate;
  if (!incDate) return null;
  const incParsed = new Date(incDate);
  if (isNaN(incParsed.getTime())) return null;
  const anniversary = new Date(year, incParsed.getMonth(), incParsed.getDate());
  const dueDate = new Date(anniversary.getTime());
  dueDate.setDate(dueDate.getDate() + calendarDaysAfter);
  return dueDate;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the next due date for an obligation based on its deadline rule.
 *
 * @param {Object}  obligation — The obligation definition
 * @param {Object|null}  entity — The entity (may have financialYearEnd, incorporationDate)
 * @param {number}  year   — The target year
 * @param {number}  [month] — Current month (0-indexed) for rolling monthly rules
 * @returns {Date|null} The next due date, or null if cannot be calculated
 */
export function calculateNextDueDate(obligation, entity, year, month) {
  const rule = obligation.deadlineRule;
  const currentMonth = typeof month === 'number' ? month : new Date().getMonth();
  const today = new Date();

  switch (rule) {
    // ----- Monthly / recurring short-period rules -----

    case 'day_7_following_month':
    case 'first_week_following_month': {
      // For a year-view listing, return the 7th of the next month from current
      const nextMonth = currentMonth + 1;
      const targetYear = nextMonth > 11 ? year + 1 : year;
      const targetMonth = nextMonth > 11 ? 0 : nextMonth;
      return new Date(targetYear, targetMonth, 7);
    }

    case 'last_business_day_of_month_following_period': {
      // Bimonthly VAT — approximate as last day of month following current period
      // VAT periods end at even months (Feb, Apr, Jun, Aug, Oct, Dec)
      // The filing month is the month after the period end
      const periodEndMonth = currentMonth % 2 === 1 ? currentMonth : currentMonth + 1;
      const filingMonth = periodEndMonth + 1;
      const targetYear = filingMonth > 11 ? year + 1 : year;
      const adjustedMonth = filingMonth > 11 ? filingMonth - 12 : filingMonth;
      return lastDayOfMonth(targetYear, adjustedMonth);
    }

    // ----- Fixed date rules -----

    case 'fixed_date': {
      const parsed = parseFixedDeadline(obligation.fixedDeadline);
      if (!parsed) return null;
      const candidate = new Date(year, parsed.month, parsed.day);
      // If the date has passed in the current year, return next year
      if (candidate < today && year === today.getFullYear()) {
        return new Date(year + 1, parsed.month, parsed.day);
      }
      return candidate;
    }

    // ----- CIPC anniversary-based -----

    case '30_business_days_after_anniversary':
    case 'filed_with_cipc_annual_return':
      return calculateAnniversaryDeadline(entity, year, BUSINESS_DAYS_30_AS_CALENDAR);

    // ----- Financial year-end relative rules -----

    case '6_months_after_tax_year_start': {
      const yearEndDate = getEntityYearEnd(entity, year - 1);
      if (!yearEndDate) return null;
      // Tax year starts the day after year-end
      const taxYearStart = new Date(yearEndDate.getTime());
      taxYearStart.setDate(taxYearStart.getDate() + 1);
      return addMonths(taxYearStart, 6);
    }

    case 'last_day_of_financial_year': {
      return getEntityYearEnd(entity, year);
    }

    case '6_months_after_financial_year_end': {
      const yearEnd = getEntityYearEnd(entity, year);
      if (!yearEnd) return null;
      return addMonths(yearEnd, 6);
    }

    case '12_months_after_financial_year_end': {
      const yearEnd = getEntityYearEnd(entity, year);
      if (!yearEnd) return null;
      return addMonths(yearEnd, 12);
    }

    case 'aligned_to_financial_year_end': {
      return getEntityYearEnd(entity, year);
    }

    // ----- SARS-announced windows -----

    case 'sars_announced_sep_oct_window': {
      return new Date(year, 9, 31); // October 31
    }

    case 'april_1_to_may_31_window': {
      return new Date(year, 4, 31); // May 31
    }

    // ----- Manual / per-entity rules -----

    case 'per_entity_licence_expiry':
    case 'per_entity_inspection_anniversary':
    case 'manual': {
      return null;
    }

    default: {
      return null;
    }
  }
}

/**
 * Format a due date for display, or return a placeholder message.
 *
 * @param {Date|null} date
 * @param {string}    deadlineRule — For generating appropriate "not set" messages
 * @returns {string}  Formatted date string or placeholder HTML
 */
export function formatDueDate(date, deadlineRule) {
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.toLocaleDateString('en-ZA', DATE_FORMAT_OPTIONS);
  }

  // Year-end-relative rules
  if (YEAR_END_RELATIVE_RULES.has(deadlineRule)) {
    return '<span class="text-muted fst-italic">Year-end not set</span>';
  }

  // Manual / per-entity rules
  if (MANUAL_RULES.has(deadlineRule)) {
    return '<span class="text-muted fst-italic">Set manually</span>';
  }

  // Anniversary-based rules
  if (deadlineRule === '30_business_days_after_anniversary' || deadlineRule === 'filed_with_cipc_annual_return') {
    return '<span class="text-muted fst-italic">Anniversary not set</span>';
  }

  return '<span class="text-muted fst-italic">TBD</span>';
}

/**
 * Determine filing status based on due date and filing record.
 *
 * @param {Date|null}   dueDate — The calculated due date
 * @param {Object|null} filing  — The filing record from RTDB
 * @returns {string} Status: 'filed' | 'overdue' | 'pending' | 'not_applicable' | 'in_progress'
 */
export function getFilingStatus(dueDate, filing) {
  // Check filing record first
  if (filing && filing.status) {
    if (filing.status === 'filed') return 'filed';
    if (filing.status === 'not_applicable') return 'not_applicable';
    if (filing.status === 'in_progress') return 'in_progress';
  }

  // Check overdue based on due date
  if (dueDate instanceof Date && !isNaN(dueDate.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate < today) {
      return 'overdue';
    }
  }

  return 'pending';
}
