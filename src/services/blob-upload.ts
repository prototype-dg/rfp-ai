/**
 * blob-upload.ts
 *
 * Inline replacement for the VPS proposal-upload relay
 * (vps/pdf-sidecar/main.py: /proposal-upload/init, PUT /proposal-upload/{token}/{filename},
 *  GET /proposal-temp/{token}/{filename}, DELETE /proposal-temp/{token}/{filename}).
 *
 * The old 3-hop flow:
 *   browser → PUT VPS relay (/proposal-upload/{token}/{filename})
 *          → Worker GET VPS (/proposal-temp/{token}/{filename})
 *          → Worker stream to R2
 *
 * The new 1-hop flow:
 *   browser → POST /submit/:rfpId/upload-file (streams directly into Azure Blob)
 *          → Worker records blob path in DB
 *          → Worker streams from Azure Blob to R2 for final storage
 *
 * On Azure App Service there is no 128 MB Worker body limit and no 30 s wall-clock
 * limit, so we can receive the file directly in the Hono handler and pipe it straight
 * to Azure Blob Storage using BlockBlobClient.uploadStream() — never buffers the
 * complete file in memory.
 *
 * Phase 3 of the Azure sidecar inline migration.
 */

import { BlobServiceClient, type BlockBlobUploadStreamOptions } from '@azure/storage-blob'
import { Readable } from 'stream'

// ── Azure Blob client (lazy, singleton) ──────────────────────────────────────
let _blobServiceClient: BlobServiceClient | null = null

function getBlobServiceClient(connectionString: string): BlobServiceClient {
  if (!_blobServiceClient) {
    _blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  }
  return _blobServiceClient
}

// Upload options — 4 MB blocks, 4 parallel workers; handles files of any size
const BLOCK_SIZE = 4 * 1024 * 1024   // 4 MB per block
const UPLOAD_CONCURRENCY = 4         // 4 parallel block uploads

export interface BlobUploadResult {
  containerName: string
  blobName: string
  /** Full URL (no SAS) — e.g. https://account.blob.core.windows.net/container/blob */
  url: string
  sizeBytes: number
}

/**
 * uploadStreamToBlob
 *
 * Streams a ReadableStream (from Hono request body) directly to Azure Blob Storage.
 * Never buffers the entire file in memory — suitable for files of any size.
 *
 * @param stream          Node.js Readable or Web ReadableStream from the request
 * @param blobName        Path within the container, e.g. "proposals/rfp-5/acme_tech.pdf"
 * @param contentType     MIME type, e.g. "application/pdf"
 * @param connectionString AZURE_STORAGE_CONNECTION_STRING secret
 * @param containerName   Azure Blob container name (default: "proposal-uploads")
 */
export async function uploadStreamToBlob(
  stream: ReadableStream | NodeJS.ReadableStream,
  blobName: string,
  contentType: string,
  connectionString: string,
  containerName = 'proposal-uploads'
): Promise<BlobUploadResult> {
  const client = getBlobServiceClient(connectionString)
  const containerClient = client.getContainerClient(containerName)

  // Ensure container exists (idempotent)
  await containerClient.createIfNotExists()

  const blockBlobClient = containerClient.getBlockBlobClient(blobName)

  // Normalise to Node.js Readable if given a Web ReadableStream
  let nodeStream: NodeJS.ReadableStream
  if (stream instanceof ReadableStream) {
    nodeStream = Readable.fromWeb(stream as any)
  } else {
    nodeStream = stream
  }

  // Track bytes as they flow through
  let sizeBytes = 0
  const countingStream = new Readable({
    read() {},
  })
  ;(nodeStream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
    sizeBytes += chunk.length
    countingStream.push(chunk)
  })
  ;(nodeStream as NodeJS.ReadableStream).on('end', () => countingStream.push(null))
  ;(nodeStream as NodeJS.ReadableStream).on('error', (err) => countingStream.destroy(err))

  await blockBlobClient.uploadStream(countingStream, BLOCK_SIZE, UPLOAD_CONCURRENCY, {
    blobHTTPHeaders: { blobContentType: contentType },
  })

  console.log(`[blob-upload] uploaded ${blobName} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) to ${containerName}`)

  return {
    containerName,
    blobName,
    url: blockBlobClient.url,
    sizeBytes,
  }
}

/**
 * downloadBlobAsStream
 *
 * Downloads a blob as a Node.js ReadableStream for piping to R2 or returning
 * to the client. Used during the finalize step (Azure Blob → R2).
 */
export async function downloadBlobAsStream(
  blobName: string,
  connectionString: string,
  containerName = 'proposal-uploads'
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; sizeBytes: number }> {
  const client = getBlobServiceClient(connectionString)
  const containerClient = client.getContainerClient(containerName)
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)

  const props = await blockBlobClient.getProperties()
  const download = await blockBlobClient.download(0)

  if (!download.readableStreamBody) {
    throw new Error(`[blob-upload] no stream body for blob ${blobName}`)
  }

  return {
    stream:      download.readableStreamBody,
    contentType: props.contentType || 'application/octet-stream',
    sizeBytes:   props.contentLength || 0,
  }
}

/**
 * deleteBlobIfExists
 *
 * Best-effort cleanup of a temporary blob after it has been streamed to R2.
 * Swallows errors (fire-and-forget safe).
 */
export async function deleteBlobIfExists(
  blobName: string,
  connectionString: string,
  containerName = 'proposal-uploads'
): Promise<void> {
  try {
    const client = getBlobServiceClient(connectionString)
    const containerClient = client.getContainerClient(containerName)
    await containerClient.deleteBlob(blobName)
    console.log(`[blob-upload] deleted temp blob: ${blobName}`)
  } catch (e: any) {
    console.warn(`[blob-upload] delete failed (ignored): ${e.message}`)
  }
}
