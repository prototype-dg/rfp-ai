export type Bindings = {
  DB: D1Database
  PROPOSALS_BUCKET?: R2Bucket
  RESEND_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  GSK_API_KEY?: string
  GSK_PROJECT_ID?: string
  PDF_RENDER_URL?: string    // e.g. https://api.cpc-rfp.website/pdf
  PDF_RENDER_SECRET?: string // shared secret for the Puppeteer render service
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
