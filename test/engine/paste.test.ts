import { describe, expect, it } from "vitest";
import { looksLikePastedChunk } from "../../src/engine";
import type { CodeChunk } from "../../src/engine";

const chunk: CodeChunk = {
  language: "python",
  targetFile: "app/config.py",
  newFile: true,
  code: `import os

def load_key() -> str:
    key = os.environ.get("API_KEY")
    if not key:
        raise RuntimeError("API_KEY is not set")
    return key`,
};

describe("looksLikePastedChunk", () => {
  it("is true for the exact Code Chunk", () => {
    expect(looksLikePastedChunk(chunk.code, chunk)).toBe(true);
  });

  it("is true for the Code Chunk with different indentation, spacing and trailing spaces", () => {
    const reindented = chunk.code
      .split("\n")
      .map((line) => `\t\t${line.replace(/    /g, "\t")}   `)
      .join("\r\n");
    const respaced = chunk.code.replace('key = os', 'key   =    os');
    expect(looksLikePastedChunk(reindented, chunk)).toBe(true);
    expect(looksLikePastedChunk(respaced, chunk)).toBe(true);
  });

  it("is true for a partial paste of most of the Code Chunk", () => {
    const mostOfIt = chunk.code.split("\n").slice(0, -1).join("\n");
    expect(looksLikePastedChunk(mostOfIt, chunk)).toBe(true);
  });

  it("is false for a paste of only part of the Code Chunk", () => {
    const halfOfIt = chunk.code.split("\n").slice(0, 3).join("\n");
    expect(looksLikePastedChunk(halfOfIt, chunk)).toBe(false);
  });

  it("is false for a short typed line", () => {
    expect(looksLikePastedChunk('    key = os.environ.get("API_KEY")', chunk)).toBe(false);
  });

  it("is false for one or two typed characters", () => {
    expect(looksLikePastedChunk("k", chunk)).toBe(false);
    expect(looksLikePastedChunk("ey", chunk)).toBe(false);
  });

  it("is false for the indentation VSCode adds after Enter", () => {
    expect(looksLikePastedChunk("\n        ", chunk)).toBe(false);
    expect(looksLikePastedChunk("\n\n    ", chunk)).toBe(false);
  });

  it("is false for unrelated multi-line text", () => {
    const unrelated = `const port = 3000;
const server = createServer(handler);
server.listen(port);
console.log("listening");`;
    expect(looksLikePastedChunk(unrelated, chunk)).toBe(false);
  });

  it("is false for empty text", () => {
    expect(looksLikePastedChunk("", chunk)).toBe(false);
  });

  it("never triggers for a Code Chunk that is a single line", () => {
    const oneLine: CodeChunk = { language: "python", targetFile: "app/main.py", code: 'print("hello")', newFile: true };
    expect(looksLikePastedChunk('print("hello")', oneLine)).toBe(false);
  });
});
