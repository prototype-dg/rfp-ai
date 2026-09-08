/**
 * Brand Profile System
 * ====================
 * Defines all brand-specific configuration for each profile.
 * The active profile is stored in the DB (config table, key='active_profile')
 * and reloaded every 60 seconds — no restart required to switch.
 *
 * Profiles: 'andersen' | 'cpc'
 */

export type ProfileId = 'andersen' | 'cpc'

export interface BrandProfile {
  id: ProfileId

  // ── Identity ──────────────────────────────────────────────────────────────
  orgName: string           // Full org name shown in UI + documents
  orgNameShort: string      // Short form for sidebar, badges
  orgNameArabic?: string    // Arabic name (CPC only)
  orgLocation: string       // City / country line
  appTitle: string          // Browser tab + page title
  rfpRefPrefix: string      // e.g. 'AND/PROC/' or 'CPC/PROC/'
  procurementEmail: string  // From address + submission address in docs
  procurementEmailLabel: string // Display label for the from address

  // ── Logo / Emblem ─────────────────────────────────────────────────────────
  logoPath: string          // Path to sidebar logo/emblem image
  logoAlt: string
  faviconColor: string      // theme-color meta tag

  // ── CSS Design Tokens ─────────────────────────────────────────────────────
  css: {
    // Primary accent
    accent: string          // e.g. #FFDB00 or #BA9765
    accentHover: string
    accentTint: string      // very light wash of accent
    accentDeep: string      // dark version of accent (text on accent bg)
    accentLine: string      // border/divider using accent family

    // Surface / background
    pageBg: string          // body background
    paper: string           // card / modal background (#fff)
    sidebarBg: string       // sidebar background color
    sidebarActiveBg: string // active nav item bg

    // Text
    ink: string             // primary text
    inkMid: string          // secondary text
    inkMuted: string        // placeholder / disabled
    line: string            // generic border

    // Semantic
    errorBg: string
    errorFg: string
    successBg: string
    successFg: string

    // UI shape
    radiusPill: string      // badge border-radius
  }

  // ── Typography ────────────────────────────────────────────────────────────
  fonts: {
    googleFontsUrl: string  // Full Google Fonts <link href>
    display: string         // CSS font-family for headings
    body: string            // CSS font-family for body
    mono: string            // CSS font-family for code/labels
    arabic?: string         // CSS font-family for Arabic text
  }

  // ── Language / Locale ─────────────────────────────────────────────────────
  defaultLocale: string     // 'en' | 'ar'
  supportedLocales: string[]
  rtlSupport: boolean

  // ── PDF Letterhead ────────────────────────────────────────────────────────
  pdf: {
    // Andersen: uses inline SVG topo band; CPC: uses background image
    mode: 'andersen-topo' | 'cpc-bg-image'
    letterheadBgPath?: string   // CPC: path to bg_a4.png served from /static/
    contentPaddingTop: string   // mm — space for letterhead
    contentPaddingBottom: string
    contentPaddingLeft: string
    contentPaddingRight: string
    fontFamily: string          // inline style font stack for PDF body
    bodyColor: string           // #1A1A1A
    accentBorderColor: string   // section heading underline color
    footerText: string          // text in absolute bottom footer
    footerColor: string
  }

  // ── Email Templates ───────────────────────────────────────────────────────
  email: {
    headerBg: string        // email header background
    headerText: string      // email header text color
    headerTitle: string     // e.g. "Crown Prince's Court — Procurement"
    headerSubtitle: string  // e.g. email address shown in header
    bodyBg: string
    footerNote: string      // small print at bottom of emails
  }

  // ── LLM System Prompt Context ─────────────────────────────────────────────
  llm: {
    orgContext: string          // Who is issuing the RFP
    procurementSpecialistRole: string  // System prompt persona
    mandatoryRequirements: string      // Any non-negotiable reqs (e.g. Arabic RTL)
    submissionInstructions: string     // Footer instructions in generated RFPs
    qaClosedMessage: string            // Auto-reply when Q&A is closed
  }

  // ── Vendor Portal ─────────────────────────────────────────────────────────
  vendorPortal: {
    pageTitle: string
    headerBorderColor: string
    headerBg: string
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANDERSEN PROFILE
// ═══════════════════════════════════════════════════════════════════════════════
export const ANDERSEN_PROFILE: BrandProfile = {
  id: 'andersen',

  orgName: 'Andersen',
  orgNameShort: 'Andersen',
  orgLocation: 'Global',
  appTitle: 'AI RFP Management — Andersen',
  rfpRefPrefix: 'AND/PROC/',
  procurementEmail: 'procurement@andersenlab.com.pl',
  procurementEmailLabel: 'Andersen Procurement',

  logoPath: '/static/andersen-logo-full.png',
  logoAlt: 'Andersen Logo',
  faviconColor: '#FFDB00',

  css: {
    accent:         '#FFDB00',
    accentHover:    '#FFE963',
    accentTint:     '#FFFBEC',
    accentDeep:     '#3A3E45',
    accentLine:     '#FFE963',

    pageBg:         '#FAFAFA',
    paper:          '#FFFFFF',
    sidebarBg:      '#020D1C',
    sidebarActiveBg:'rgba(255,219,0,0.12)',

    ink:            '#020303',
    inkMid:         '#556170',
    inkMuted:       '#ADADAD',
    line:           '#E0E0E0',

    errorBg:        '#FBE7EA',
    errorFg:        '#C43042',
    successBg:      '#E6F5E9',
    successFg:      '#1B7A32',

    radiusPill:     '4px',
  },

  fonts: {
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Noto+Sans+Arabic:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap',
    display: "'Roboto', system-ui, sans-serif",
    body:    "'Roboto', system-ui, sans-serif",
    mono:    "'JetBrains Mono', monospace",
    arabic:  "'Noto Sans Arabic', sans-serif",
  },

  defaultLocale: 'en',
  supportedLocales: ['en', 'de', 'fr', 'pl'],
  rtlSupport: false,

  pdf: {
    mode: 'andersen-topo',
    contentPaddingTop:    '32mm',
    contentPaddingBottom: '22mm',
    contentPaddingLeft:   '20mm',
    contentPaddingRight:  '20mm',
    fontFamily: "Roboto, -apple-system, 'Segoe UI', sans-serif",
    bodyColor:  '#020303',
    accentBorderColor: '#FFDB00',
    footerText: 'Andersen — Confidential',
    footerColor: '#ADADAD',
  },

  email: {
    headerBg:       '#020D1C',
    headerText:     '#FFDB00',
    headerTitle:    'Andersen — Procurement',
    headerSubtitle: 'procurement@andersenlab.com.pl',
    bodyBg:         '#ffffff',
    footerNote:     'This communication is confidential and intended solely for the named recipient.',
  },

  llm: {
    orgContext: 'Andersen, a global software engineering and technology consulting group.',
    procurementSpecialistRole: 'You are a senior procurement specialist at Andersen, a global software engineering and technology consulting group. You produce formal, comprehensive, publication-ready Request for Proposal (RFP) documents issued to external vendors.',
    mandatoryRequirements: 'All deliverables must support English as the primary language. Additional language support (German, French, Polish) is preferred.',
    submissionInstructions: 'All proposals must be submitted to procurement@andersenlab.com.pl with subject: "RFP Response – [REF] – [Your Company Name]".',
    qaClosedMessage: 'The Q&A period for this RFP has now closed. Andersen is no longer accepting clarification questions for this tender. All vendors have been provided with a consolidated Q&A response document. If you have not received this document, please contact procurement@andersenlab.com.pl referencing the RFP number.',
  },

  vendorPortal: {
    pageTitle:         'Proposal Submission — Andersen',
    headerBorderColor: '#FFDB00',
    headerBg:          '#ffffff',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// CPC PROFILE
// ═══════════════════════════════════════════════════════════════════════════════
export const CPC_PROFILE: BrandProfile = {
  id: 'cpc',

  orgName: "Crown Prince's Court",
  orgNameShort: 'CPC',
  orgNameArabic: 'ديوان ولي العهد',
  orgLocation: 'Abu Dhabi, United Arab Emirates',
  appTitle: "AI RFP Management — Crown Prince's Court",
  rfpRefPrefix: 'CPC/PROC/',
  procurementEmail: 'procurement@andersenlab.com.pl',
  procurementEmailLabel: 'CPC Procurement',

  logoPath: '/static/cpc-emblem.png',
  logoAlt: 'Crown Prince\'s Court Emblem',
  faviconColor: '#BA9765',

  css: {
    accent:         '#BA9765',
    accentHover:    '#E9DCC4',
    accentTint:     '#F5EFE3',
    accentDeep:     '#745B35',
    accentLine:     '#E9DCC4',

    pageBg:         '#FBF8F2',
    paper:          '#FFFFFF',
    sidebarBg:      '#FBF8F2',
    sidebarActiveBg:'#F5EFE3',

    ink:            '#1B1712',
    inkMid:         '#4A4238',
    inkMuted:       '#7A6E62',
    line:           '#E7DFCE',

    errorBg:        '#FDF2F2',
    errorFg:        '#8B2020',
    successBg:      '#EDFAF3',
    successFg:      '#2E7D52',

    radiusPill:     '20px',
  },

  fonts: {
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Kufi+Arabic:wght@300;400;500;700&display=swap',
    display: "'Cormorant Garamond', Georgia, serif",
    body:    "'Inter', system-ui, sans-serif",
    mono:    "'JetBrains Mono', 'Courier New', monospace",
    arabic:  "'Noto Kufi Arabic', sans-serif",
  },

  defaultLocale: 'en',
  supportedLocales: ['en', 'ar'],
  rtlSupport: true,

  pdf: {
    mode: 'cpc-bg-image',
    letterheadBgPath: '/static/cpc-letterhead-bg.png',
    contentPaddingTop:    '50mm',
    contentPaddingBottom: '22mm',
    contentPaddingLeft:   '25mm',
    contentPaddingRight:  '25mm',
    fontFamily: "Arial, Calibri, 'Segoe UI', sans-serif",
    bodyColor:  '#1A1A1A',
    accentBorderColor: '#A79C7F',
    footerText: "Crown Prince's Court — Confidential",
    footerColor: '#888888',
  },

  email: {
    headerBg:       '#1a1a2e',
    headerText:     '#c9a84c',
    headerTitle:    "Crown Prince's Court — Procurement",
    headerSubtitle: 'procurement@andersenlab.com.pl',
    bodyBg:         '#ffffff',
    footerNote:     'This document is CONFIDENTIAL and intended solely for the named recipient. Unauthorized distribution is prohibited under UAE Federal Law. البريد الإلكتروني سري ومخصص للمستلم المحدد فقط.',
  },

  llm: {
    orgContext: "The Crown Prince's Court (CPC) of Abu Dhabi, UAE — a sovereign UAE government institution (Diwan Wali Al Ahd).",
    procurementSpecialistRole: "You are a senior government procurement specialist at the Crown Prince's Court (CPC) of Abu Dhabi, UAE. You produce formal, comprehensive, publication-ready Request for Proposal (RFP) documents issued to external vendors on official CPC letterhead. You write on behalf of the Crown Prince's Court (Diwan Wali Al Ahd), Abu Dhabi, a sovereign UAE government institution.",
    mandatoryRequirements: 'Full Arabic (RTL) and English bilingual UI is mandatory across all screens. Hijri and Gregorian calendar support is required in all date fields and reports. All deliverables — documentation, training materials, and user guides — must be provided in both Arabic and English.',
    submissionInstructions: 'All proposals must be submitted to procurement@andersenlab.com.pl with subject: "RFP Response – [REF] – [Your Company Name]". Hard copy: 2 printed copies to Procurement Department, Crown Prince\'s Court, Abu Dhabi.',
    qaClosedMessage: "The Q&A period for this Request for Proposal has now closed. The Crown Prince's Court (CPC) is no longer able to accept or process clarification questions for this tender. All vendors have been provided with a consolidated Q&A response document. If you have not received this document, please contact procurement@andersenlab.com.pl referencing the RFP number.",
  },

  vendorPortal: {
    pageTitle:         "Proposal Submission — Crown Prince's Court",
    headerBorderColor: '#BA9765',
    headerBg:          '#ffffff',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// Profile registry + runtime state
// ═══════════════════════════════════════════════════════════════════════════════
export const PROFILES: Record<ProfileId, BrandProfile> = {
  andersen: ANDERSEN_PROFILE,
  cpc:      CPC_PROFILE,
}

export function getProfile(id: string): BrandProfile {
  return PROFILES[id as ProfileId] ?? ANDERSEN_PROFILE
}

// In-memory active profile — loaded from DB, refreshed every 60s
let _activeProfile: BrandProfile = ANDERSEN_PROFILE
let _lastLoaded = 0
const REFRESH_INTERVAL_MS = 60_000

export function getActiveProfile(): BrandProfile {
  return _activeProfile
}

export function setActiveProfile(id: ProfileId): void {
  _activeProfile = getProfile(id)
  _lastLoaded = Date.now()
  console.log(`[profile] Active profile switched to: ${id}`)
}

export function shouldRefresh(): boolean {
  return Date.now() - _lastLoaded > REFRESH_INTERVAL_MS
}

export function markRefreshed(): void {
  _lastLoaded = Date.now()
}
