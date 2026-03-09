/**
 * Corporate Compliance Module — Seed Data (CommonJS)
 *
 * Server-side version of entity and obligation definitions
 * for the Katsouris group corporate compliance tracker.
 *
 * Used by seedComplianceData Cloud Function.
 */

// ---------------------------------------------------------------------------
// ENTITIES
// ---------------------------------------------------------------------------

const ENTITIES = {
  // -- Active Entities (8) --

  K2019183304: {
    registrationNumber: "K2019183304",
    name: "KATSOURIS INVESTMENTS",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "HoldCo — Section 42 asset-for-share vehicle",
    cipcStatus: "IN BUSINESS",
    oversight: "Lourens Kruger",
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: "Priority — required for S42 transfer.",
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  M2009011674: {
    registrationNumber: "M2009011674",
    name: "CAPRAMAX",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "OB The Grove — Asset Holding Entity",
    cipcStatus: "IN BUSINESS",
    oversight: "Lourens Kruger",
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: "Intercompany agreements with Unocron must be documented.",
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  M2009008158: {
    registrationNumber: "M2009008158",
    name: "UNOCRON",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "OB The Grove — Trading Entity",
    cipcStatus: "IN BUSINESS",
    oversight: "Lourens Kruger",
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: "Trading entity for The Grove.",
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  K2022691369: {
    registrationNumber: "K2022691369",
    name: "KING FISH",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "OB Strand",
    cipcStatus: "IN BUSINESS",
    oversight: null,
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: null,
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  K2022485535: {
    registrationNumber: "K2022485535",
    name: "SEA GAMBIT",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "OB Gordons Bay",
    cipcStatus: "IN BUSINESS",
    oversight: null,
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: null,
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  K2022692469: {
    registrationNumber: "K2022692469",
    name: "FISH EMPIRE",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "OB Brits",
    cipcStatus: "IN BUSINESS",
    oversight: null,
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: null,
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  K2011100483: {
    registrationNumber: "K2011100483",
    name: "MILVIPART",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "OB Mall@Reds",
    cipcStatus: "IN BUSINESS",
    oversight: null,
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: null,
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  K2022690783: {
    registrationNumber: "K2022690783",
    name: "ASK OPERATIONS",
    type: "PRIVATE COMPANY",
    status: "active",
    purpose: "Group management vehicle — underutilised",
    cipcStatus: "IN BUSINESS",
    oversight: null,
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: "Decision pending: activate as group management co or wind down.",
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  },

  // -- Dormant Entities (1) --

  K2013080089: {
    registrationNumber: "K2013080089",
    name: "AJJ-FISH",
    type: "PRIVATE COMPANY",
    status: "dormant",
    purpose: "OB Neighbourhood Square — store closed",
    cipcStatus: "DORMANT",
    oversight: null,
    oversightPhone: null,
    arCompliant: false,
    boCompliant: false,
    incorporationDate: null,
    financialYearEnd: "02-28",
    notes: "Voluntary deregistration application required.",
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z"
  }
};

// ---------------------------------------------------------------------------
// OBLIGATIONS
// ---------------------------------------------------------------------------

const OBLIGATIONS = {
  // -- Monthly --

  paye_monthly: {
    id: "paye_monthly",
    name: "PAYE / UIF / SDL (EMP201)",
    category: "monthly",
    frequency: "monthly",
    deadlineRule: "day_7_following_month",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: true,
    requiresEmployees: true,
    penaltyNote: "10% penalty on late payment plus SARS interest."
  },

  vat_bimonthly: {
    id: "vat_bimonthly",
    name: "VAT Return (VAT201)",
    category: "monthly",
    frequency: "bimonthly",
    deadlineRule: "last_business_day_of_month_following_period",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: false,
    appliesToEntityIds: [
      "M2009011674",
      "M2009008158",
      "K2022691369",
      "K2022485535",
      "K2022692469",
      "K2011100483"
    ],
    requiresVatRegistration: true,
    penaltyNote: "10% penalty on late payment; potential additional fixed penalty."
  },

  ob_royalty: {
    id: "ob_royalty",
    name: "Ocean Basket Royalty & Marketing Levy",
    category: "monthly",
    frequency: "monthly",
    deadlineRule: "first_week_following_month",
    authority: "Ocean Basket Franchisor",
    defaultOwner: "Operations Manager",
    appliesToAll: false,
    appliesToEntityIds: [
      "M2009011674",
      "M2009008158",
      "K2022691369",
      "K2022485535",
      "K2022692469",
      "K2011100483"
    ],
    penaltyNote: "Franchise agreement breach risk."
  },

  // -- Biannual --

  provisional_tax_1: {
    id: "provisional_tax_1",
    name: "Provisional Tax — 1st Payment (IRP6)",
    category: "biannual",
    frequency: "biannual",
    deadlineRule: "6_months_after_tax_year_start",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: true,
    yearEndRelative: true,
    penaltyNote: "20% penalty if estimate is less than 80% of actual."
  },

  provisional_tax_2: {
    id: "provisional_tax_2",
    name: "Provisional Tax — 2nd Payment (IRP6)",
    category: "biannual",
    frequency: "biannual",
    deadlineRule: "last_day_of_financial_year",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: true,
    yearEndRelative: true,
    penaltyNote: "20% penalty if estimate is less than 80% of actual."
  },

  emp501_interim: {
    id: "emp501_interim",
    name: "PAYE Reconciliation — Interim (EMP501)",
    category: "biannual",
    frequency: "biannual",
    deadlineRule: "sars_announced_sep_oct_window",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: true,
    requiresEmployees: true,
    penaltyNote: "Administrative penalty per employee record."
  },

  // -- Annual --

  emp501_annual: {
    id: "emp501_annual",
    name: "PAYE Reconciliation — Annual (EMP501)",
    category: "annual",
    frequency: "annual",
    deadlineRule: "april_1_to_may_31_window",
    fixedDeadline: "05-31",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: true,
    requiresEmployees: true,
    penaltyNote: "Administrative penalty per employee record."
  },

  coida_roe: {
    id: "coida_roe",
    name: "Compensation Fund — Return of Earnings (W.As.2)",
    category: "annual",
    frequency: "annual",
    deadlineRule: "fixed_date",
    fixedDeadline: "03-31",
    authority: "Compensation Fund (DOL)",
    defaultOwner: "Accountant",
    appliesToAll: true,
    requiresEmployees: true,
    penaltyNote: "10% increase in assessment; potential prosecution."
  },

  cipc_annual_return: {
    id: "cipc_annual_return",
    name: "CIPC Annual Return",
    category: "annual",
    frequency: "annual",
    deadlineRule: "30_business_days_after_anniversary",
    authority: "CIPC",
    defaultOwner: "CIPC Agent",
    appliesToAll: true,
    penaltyNote: "Late-filing penalty; risk of deregistration after 2 years."
  },

  beneficial_ownership: {
    id: "beneficial_ownership",
    name: "Beneficial Ownership Declaration",
    category: "annual",
    frequency: "annual",
    deadlineRule: "filed_with_cipc_annual_return",
    authority: "CIPC",
    defaultOwner: "CIPC Agent",
    appliesToAll: true,
    penaltyNote: "CIPC may refuse to file annual return without BO declaration."
  },

  annual_financial_statements: {
    id: "annual_financial_statements",
    name: "Annual Financial Statements (AFS)",
    category: "annual",
    frequency: "annual",
    deadlineRule: "6_months_after_financial_year_end",
    authority: "CIPC / SARS",
    defaultOwner: "Auditor",
    appliesToAll: true,
    yearEndRelative: true,
    oversightEntities: [
      "K2019183304",
      "M2009011674",
      "M2009008158"
    ],
    penaltyNote: "Administrative penalty; CIPC compliance failure."
  },

  itr14: {
    id: "itr14",
    name: "Corporate Income Tax Return (ITR14)",
    category: "annual",
    frequency: "annual",
    deadlineRule: "12_months_after_financial_year_end",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: true,
    yearEndRelative: true,
    penaltyNote: "Administrative non-compliance penalty (fixed + monthly)."
  },

  provisional_tax_3: {
    id: "provisional_tax_3",
    name: "Provisional Tax — 3rd Top-Up (Optional)",
    category: "annual",
    frequency: "annual",
    deadlineRule: "6_months_after_financial_year_end",
    authority: "SARS",
    defaultOwner: "Accountant",
    appliesToAll: true,
    optional: true,
    yearEndRelative: true,
    penaltyNote: null
  },

  wsp_atr: {
    id: "wsp_atr",
    name: "Skills Development — WSP / ATR Submission",
    category: "annual",
    frequency: "annual",
    deadlineRule: "fixed_date",
    fixedDeadline: "04-30",
    authority: "CATHSSETA",
    defaultOwner: "HR / Accountant",
    appliesToAll: true,
    requiresSDL: true,
    penaltyNote: "Loss of mandatory grant (up to 20% of SDL contribution)."
  },

  employment_equity: {
    id: "employment_equity",
    name: "Employment Equity Report",
    category: "annual",
    frequency: "annual",
    deadlineRule: "fixed_date",
    fixedDeadline: "01-15",
    authority: "Dept of Employment & Labour",
    defaultOwner: "HR / Operations Manager",
    appliesToAll: true,
    requiresMinEmployees: 50,
    penaltyNote: "Fine up to R1.5m or 2% of turnover."
  },

  liquor_licence: {
    id: "liquor_licence",
    name: "Liquor Licence Renewal",
    category: "annual",
    frequency: "annual",
    deadlineRule: "per_entity_licence_expiry",
    authority: "Provincial Liquor Board",
    defaultOwner: "Store Manager",
    appliesToAll: false,
    appliesToEntityIds: [
      "M2009011674",
      "M2009008158",
      "K2022691369",
      "K2022485535",
      "K2022692469",
      "K2011100483"
    ],
    penaltyNote: "Trading without valid licence is a criminal offence."
  },

  ohs_compliance: {
    id: "ohs_compliance",
    name: "Health & Safety Compliance Certificate (OHS Act)",
    category: "annual",
    frequency: "annual",
    deadlineRule: "per_entity_inspection_anniversary",
    authority: "Dept of Employment & Labour",
    defaultOwner: "Operations Manager",
    appliesToAll: false,
    appliesToEntityIds: [
      "M2009011674",
      "M2009008158",
      "K2022691369",
      "K2022485535",
      "K2022692469",
      "K2011100483"
    ],
    penaltyNote: "Closure order; fine or imprisonment under OHS Act."
  },

  bbbee: {
    id: "bbbee",
    name: "B-BBEE Compliance Certificate / Affidavit",
    category: "annual",
    frequency: "annual",
    deadlineRule: "aligned_to_financial_year_end",
    authority: "IRBA-accredited Verification Agency",
    defaultOwner: "Management",
    appliesToAll: true,
    yearEndRelative: true,
    penaltyNote: "Reduced B-BBEE score; loss of procurement opportunities."
  },

  // -- Once-Off --

  s42_transfer: {
    id: "s42_transfer",
    name: "Section 42 Asset-for-Share Transfer",
    category: "once_off",
    frequency: "once_off",
    deadlineRule: "manual",
    authority: "SARS / CIPC",
    defaultOwner: "Lourens Kruger + Corporate Attorney",
    appliesToAll: false,
    appliesToEntityIds: ["K2019183304"],
    notes: "Dependent on Katsouris Investments AR compliance.",
    penaltyNote: null
  },

  intercompany_agreement: {
    id: "intercompany_agreement",
    name: "Intercompany Agreement — The Grove Structure",
    category: "once_off",
    frequency: "once_off",
    deadlineRule: "manual",
    authority: "Internal / SARS",
    defaultOwner: "Attorney / Lourens Kruger",
    appliesToAll: false,
    appliesToEntityIds: [
      "M2009011674",
      "M2009008158"
    ],
    penaltyNote: null
  },

  ajj_deregistration: {
    id: "ajj_deregistration",
    name: "Voluntary Deregistration — AJJ-FISH",
    category: "once_off",
    frequency: "once_off",
    deadlineRule: "manual",
    authority: "CIPC",
    defaultOwner: "Attorney / Accountant",
    appliesToAll: false,
    appliesToEntityIds: ["K2013080089"],
    penaltyNote: null
  }
};

// ---------------------------------------------------------------------------
// DEFAULT SETTINGS
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  reminders: {
    enabled: true,
    channels: {
      whatsapp: true,
      email: false
    },
    schedule: {
      daysBeforeDue: [7, 30, 90],
      dailyCheckTime: "06:00",
      timezone: "Africa/Johannesburg"
    },
    recipients: {
      director: {
        name: "Director",
        phone: null,
        email: null
      }
    }
  },
  currentYear: new Date().getFullYear(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  ENTITIES,
  OBLIGATIONS,
  DEFAULT_SETTINGS
};
