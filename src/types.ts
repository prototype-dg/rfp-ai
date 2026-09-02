export type Bindings = {
  // DB accepts Cloudflare D1Database in Workers runtime, or our better-sqlite3 shim on Azure
  DB: D1Database
  // PROPOSALS_BUCKET accepts Cloudflare R2Bucket in Workers runtime, or our AzureBlobBucket shim on Azure
  PROPOSALS_BUCKET?: R2Bucket
  RESEND_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  GSK_API_KEY?: string
  GSK_PROJECT_ID?: string

  // ── Legacy VPS sidecar (kept for rollback; unused after inline migration) ──
  PDF_RENDER_URL?: string    // e.g. https://api.andersenlab.com/pdf
  PDF_RENDER_SECRET?: string // shared secret for the Puppeteer render service
  PDF_SIDECAR_URL?: string
  PDF_SIDECAR_SECRET?: string

  // ── Inline OCR (Phase 2 — replaces pdf-sidecar) ───────────────────────────
  GOOGLE_VISION_API_KEY?: string

  // ── Azure Blob Storage (Phase 3 — replaces VPS upload relay) ─────────────
  AZURE_STORAGE_CONNECTION_STRING?: string
  AZURE_BLOB_CONTAINER?: string          // default: 'proposal-uploads'
}

// Payload for async large-file processing jobs (passed to ctx.waitUntil / internal endpoint)
export type ProposalProcessingJob = {
  rfpId: number
  vendorId: number
  proposalId: number
  r2Key: string
  filename: string
  contentType: string
  attachmentIndex: number
  label: 'technical' | 'commercial' | 'other'
}
