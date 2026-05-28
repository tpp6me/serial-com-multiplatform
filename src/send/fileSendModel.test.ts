import { describe, expect, it, vi } from "vitest";
import { readFileBytes, runFileSend, splitFileChunks } from ".";

describe("file send model", () => {
  it("reads a selected file as binary", async () => {
    const file = new File([Uint8Array.from([0x00, 0xff, 0x41])], "payload.bin");

    await expect(readFileBytes(file)).resolves.toEqual(Uint8Array.from([0x00, 0xff, 0x41]));
  });

  it("splits files into default 512-byte chunks", () => {
    const bytes = new Uint8Array(1_025);
    const chunks = splitFileChunks(bytes);

    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([512, 512, 1]);
  });

  it("sends chunks with pacing and progress", async () => {
    const writeChunk = vi.fn(async (chunk: Uint8Array) => chunk.byteLength);
    const wait = vi.fn(async () => undefined);
    const onProgress = vi.fn();

    const result = await runFileSend({
      bytes: Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05]),
      chunkBytes: 2,
      pacingMs: 10,
      writeChunk,
      wait,
      onProgress
    });

    expect(writeChunk.mock.calls.map(([chunk]) => [...chunk])).toEqual([
      [0x01, 0x02],
      [0x03, 0x04],
      [0x05]
    ]);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      totalBytes: 5,
      sentBytes: 5,
      chunkIndex: 3,
      chunkCount: 3
    });
    expect(result.sentBytes).toBe(5);
  });

  it("can cancel before sending the next chunk", async () => {
    const abortController = new AbortController();
    const writeChunk = vi.fn(async (chunk: Uint8Array) => {
      abortController.abort();
      return chunk.byteLength;
    });

    await expect(
      runFileSend({
        bytes: Uint8Array.from([0x01, 0x02, 0x03]),
        chunkBytes: 1,
        pacingMs: 0,
        signal: abortController.signal,
        writeChunk
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(writeChunk).toHaveBeenCalledTimes(1);
  });

  it("stops cleanly on partial writes so the backend marker can be logged", async () => {
    await expect(
      runFileSend({
        bytes: Uint8Array.from([0x01, 0x02]),
        chunkBytes: 2,
        writeChunk: async () => 1
      })
    ).rejects.toThrow("partial write");
  });

  it("surfaces disconnect aborts from the write path", async () => {
    await expect(
      runFileSend({
        bytes: Uint8Array.from([0x01]),
        writeChunk: async () => {
          throw new DOMException("session disconnected", "AbortError");
        }
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
