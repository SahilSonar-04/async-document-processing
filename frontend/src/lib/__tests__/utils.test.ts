import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
  formatBytes,
  formatRelative,
  validateFile,
} from "@/lib/utils";

function makeFile(name: string, sizeBytes: number): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("formatBytes", () => {
  it("formats bytes under 1 KB", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("validateFile", () => {
  it("accepts an allowed extension under the size limit", () => {
    const file = makeFile("report.pdf", 1024);
    expect(validateFile(file)).toBeNull();
  });

  it("rejects a disallowed extension", () => {
    const file = makeFile("script.exe", 1024);
    expect(validateFile(file)).toContain("not supported");
  });

  it("rejects a file over the max size", () => {
    const file = makeFile("large.txt", (MAX_FILE_SIZE_MB + 1) * 1024 * 1024);
    expect(validateFile(file)).toContain("too large");
  });

  it("lists all allowed extensions in the rejection message", () => {
    const file = makeFile("data.unknownext", 10);
    const error = validateFile(file);
    ALLOWED_EXTENSIONS.forEach((ext) => {
      expect(error).toContain(ext);
    });
  });
});

describe("formatRelative", () => {
  it("falls back to the raw string on an invalid date", () => {
    expect(formatRelative("not-a-date")).toBe("not-a-date");
  });
});
