export const DEFAULT_FILE_SEND_CHUNK_BYTES = 512;
export const DEFAULT_FILE_SEND_PACING_MS = 10;

export type FileSendProgress = {
  totalBytes: number;
  sentBytes: number;
  chunkIndex: number;
  chunkCount: number;
};

export type RunFileSendOptions = {
  bytes: Uint8Array;
  chunkBytes?: number;
  pacingMs?: number;
  signal?: AbortSignal;
  writeChunk: (chunk: Uint8Array) => Promise<number>;
  onProgress?: (progress: FileSendProgress) => void;
  wait?: (ms: number) => Promise<void>;
};

export async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("file reader did not return binary data"));
        return;
      }

      resolve(new Uint8Array(reader.result));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("file read failed"));
    });
    reader.readAsArrayBuffer(file);
  });
}

export function splitFileChunks(
  bytes: Uint8Array,
  chunkBytes = DEFAULT_FILE_SEND_CHUNK_BYTES
): Uint8Array[] {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("chunkBytes must be a positive safe integer");
  }

  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    chunks.push(bytes.slice(offset, offset + chunkBytes));
  }

  return chunks;
}

export async function runFileSend(options: RunFileSendOptions): Promise<FileSendProgress> {
  const chunkBytes = options.chunkBytes ?? DEFAULT_FILE_SEND_CHUNK_BYTES;
  const pacingMs = Math.max(0, options.pacingMs ?? DEFAULT_FILE_SEND_PACING_MS);
  const chunks = splitFileChunks(options.bytes, chunkBytes);
  const wait = options.wait ?? delay;
  let sentBytes = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    throwIfAborted(options.signal);

    const chunk = chunks[index];
    const bytesWritten = await options.writeChunk(chunk);

    if (bytesWritten !== chunk.byteLength) {
      throw new Error(`file send stopped after partial write: ${bytesWritten}/${chunk.byteLength}`);
    }

    sentBytes += bytesWritten;
    options.onProgress?.({
      totalBytes: options.bytes.byteLength,
      sentBytes,
      chunkIndex: index + 1,
      chunkCount: chunks.length
    });

    if (pacingMs > 0 && index < chunks.length - 1) {
      await wait(pacingMs);
    }
  }

  return {
    totalBytes: options.bytes.byteLength,
    sentBytes,
    chunkIndex: chunks.length,
    chunkCount: chunks.length
  };
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("file send canceled", "AbortError");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
