export type Bindings = {
  DB: D1Database
  PROPOSALS_BUCKET?: R2Bucket
  RESEND_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
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
