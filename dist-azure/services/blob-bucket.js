"use strict";
/**
 * blob-bucket.ts — R2Bucket-compatible Azure Blob Storage adapter
 *
 * Implements the subset of the R2Bucket interface used in index.ts:
 *   bucket.put(key, body, options?)
 *   bucket.get(key)
 *   bucket.delete(key)
 *   bucket.list({ prefix, limit, cursor? })
 *
 * Drop-in replacement: no call-site changes needed in index.ts.
 * Connection string read from AZURE_STORAGE_CONNECTION_STRING env var.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.azureBlobBucket = exports.AzureBlobBucket = void 0;
const storage_blob_1 = require("@azure/storage-blob");
const CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER || 'proposal-uploads';
let _containerClient = null;
function getContainerClient() {
    if (_containerClient)
        return _containerClient;
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr)
        throw new Error('[blob] AZURE_STORAGE_CONNECTION_STRING not set');
    const serviceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connStr);
    _containerClient = serviceClient.getContainerClient(CONTAINER_NAME);
    return _containerClient;
}
// ── Adapter implementation ─────────────────────────────────────────────────
class AzureBlobBucket {
    async put(key, body, options) {
        const client = getContainerClient();
        const blobClient = client.getBlockBlobClient(key);
        const contentType = options?.httpMetadata?.contentType || 'application/octet-stream';
        if (body === null)
            return;
        if (body instanceof ReadableStream) {
            // Convert Web ReadableStream to Node.js Buffer
            const reader = body.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                if (value)
                    chunks.push(value);
            }
            const buf = Buffer.concat(chunks);
            await blobClient.uploadData(buf, { blobHTTPHeaders: { blobContentType: contentType } });
        }
        else if (typeof body === 'string') {
            await blobClient.upload(body, Buffer.byteLength(body, 'utf8'), {
                blobHTTPHeaders: { blobContentType: contentType },
            });
        }
        else {
            // ArrayBuffer or Uint8Array
            const buf = Buffer.from(body);
            await blobClient.uploadData(buf, { blobHTTPHeaders: { blobContentType: contentType } });
        }
    }
    async get(key) {
        const client = getContainerClient();
        const blobClient = client.getBlobClient(key);
        try {
            const props = await blobClient.getProperties();
            const downloadResponse = await blobClient.download();
            // Buffer the content
            const chunks = [];
            for await (const chunk of downloadResponse.readableStreamBody) {
                chunks.push(Buffer.from(chunk));
            }
            const buf = Buffer.concat(chunks);
            // Create a Web ReadableStream from the buffer
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(buf);
                    controller.close();
                },
            });
            return {
                key,
                size: props.contentLength ?? buf.length,
                httpMetadata: { contentType: props.contentType },
                body: stream,
                async arrayBuffer() {
                    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                },
                async text() {
                    return buf.toString('utf8');
                },
            };
        }
        catch (err) {
            if (err.statusCode === 404)
                return null;
            throw err;
        }
    }
    async delete(key) {
        const client = getContainerClient();
        const keys = Array.isArray(key) ? key : [key];
        await Promise.all(keys.map((k) => client.getBlobClient(k).deleteIfExists()));
    }
    async list(options = {}) {
        const client = getContainerClient();
        const { prefix, limit = 1000 } = options;
        const objects = [];
        let count = 0;
        let truncated = false;
        let lastKey;
        for await (const blob of client.listBlobsFlat({ prefix })) {
            if (count >= limit) {
                truncated = true;
                break;
            }
            objects.push({ key: blob.name, size: blob.properties.contentLength ?? 0 });
            lastKey = blob.name;
            count++;
        }
        return {
            objects,
            truncated,
            cursor: truncated ? lastKey : undefined,
        };
    }
}
exports.AzureBlobBucket = AzureBlobBucket;
exports.azureBlobBucket = new AzureBlobBucket();
//# sourceMappingURL=blob-bucket.js.map