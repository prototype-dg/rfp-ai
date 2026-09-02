/**
 * cloudflare-stubs.d.ts
 *
 * Minimal type stubs for Cloudflare Worker globals used in the codebase.
 * These let the Azure/Node.js TypeScript build succeed without the
 * @cloudflare/workers-types package, which only applies to the Workers runtime.
 *
 * The actual runtime values are injected by our adapters in index.tsx —
 * these declarations are purely for type-checking.
 */

// ── D1 Database ────────────────────────────────────────────────────────────
declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<D1RunResult>
  all<T = Record<string, unknown>>(): Promise<D1AllResult<T>>
}

declare interface D1RunResult {
  meta: { last_row_id: number; changes: number; duration?: number }
  success: boolean
}

declare interface D1AllResult<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: D1RunResult['meta']
}

declare interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1RunResult[]>
  exec(sql: string): Promise<void>
}

// ── R2 Storage ─────────────────────────────────────────────────────────────
declare interface R2Object {
  key: string
  size: number
  httpMetadata?: { contentType?: string }
  customHttpMetadata?: Record<string, string>
  customMetadata?: Record<string, string>
  body: ReadableStream
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
}

declare interface R2ListOptions {
  prefix?: string
  limit?: number
  cursor?: string
}

declare interface R2ListResult {
  objects: Array<{ key: string; size: number }>
  truncated: boolean
  cursor?: string
}

declare interface R2PutOptions {
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
}

declare interface R2Bucket {
  put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream | string | null, options?: R2PutOptions): Promise<void>
  get(key: string): Promise<R2Object | null>
  delete(key: string | string[]): Promise<void>
  list(options?: R2ListOptions): Promise<R2ListResult>
}

// ── KV Namespace ───────────────────────────────────────────────────────────
declare interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

// ── Queue ──────────────────────────────────────────────────────────────────
declare interface Message<T = unknown> {
  id: string
  body: T
  ack(): void
  retry(): void
}

declare interface MessageBatch<T = unknown> {
  queue: string
  messages: Message<T>[]
  ackAll(): void
  retryAll(): void
}

// ── ExecutionContext ───────────────────────────────────────────────────────
declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}
