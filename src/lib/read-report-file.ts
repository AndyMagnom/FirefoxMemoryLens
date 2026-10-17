/**
 * Browser-side reader for Firefox memory report files.
 *
 * Reports are downloaded from about:memory as gzip-compressed JSON
 * (memory-report.json.gz). We decompress with the native
 * DecompressionStream API — no library, no upload, nothing leaves the browser.
 */

const MAX_FILE_BYTES = 150 * 1024 * 1024; // 150 MB compressed
const MAX_UNCOMPRESSED = 400 * 1024 * 1024; // 400 MB raw JSON

export async function readReportFile(file: File): Promise<string> {
  if (file.size === 0) {
    throw new Error('The selected file is empty.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `That file is very large (${(file.size / 1048576).toFixed(0)} MB). A Firefox memory report is usually well under 150 MB.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let payload: Uint8Array = bytes;

  // gzip magic bytes 1f 8b — works regardless of the file extension
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    payload = await gunzip(bytes);
  }

  return new TextDecoder('utf-8').decode(payload);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot uncompress .gz files. Please use a current version of Firefox, Chrome or Edge — or unzip the report first and upload the .json file.'
    );
  }
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total > MAX_UNCOMPRESSED) {
        throw new Error(
          'The uncompressed report is over 400 MB — it may be corrupt. Try saving the report again.'
        );
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  } catch (err) {
    if (err instanceof Error && err.message.includes('400 MB')) throw err;
    throw new Error(
      'This looks like a gzip file but it could not be decompressed. The download may be incomplete — try saving the report again.'
    );
  }
}
