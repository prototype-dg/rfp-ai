export type Bindings = {
  DB: D1Database
  PROPOSALS_BUCKET?: R2Bucket
  PROPOSAL_QUEUE?: Queue<ProposalQueueMessage>
  RESEND_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
}

// Message schema for the Cloudflare Queue that handles async PDF processing
export type ProposalQueueMessage = {
  type: 'process_attachment'
  rfpId: number
  vendorId: number
  proposalId: number
  downloadUrl: string
  filename: string
  contentType: string
  attachmentIndex: number
  label: 'technical' | 'commercial' | 'other'
}
