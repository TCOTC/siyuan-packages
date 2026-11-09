import { expect, test } from "vitest";
import type { BetlangEngine, LanguageScore } from "./BetlangEngine";
import { LanguageDetector } from "./LanguageDetector";
import { RuleDetector } from "./RuleDetector";

const available = () => true;

const createDetector = (scores: LanguageScore[], rules: Partial<RuleDetector> = new RuleDetector(available)) =>
  new LanguageDetector({ detect: async () => scores } as unknown as BetlangEngine, rules as RuleDetector, available, (error) => {
    throw error;
  });

test("selects a supported high-confidence betlang result", async () => {
  const detector = createDetector([
    { language: "rust", score: 0.82 },
    { language: "cpp", score: 0.31 },
    { language: "python", score: 0.1 },
  ]);
  const result = await detector.detect('fn main() { println!("hello"); }');
  expect(result.language).toBe("rust");
  expect(result.source).toBe("betlang");
});

test("rejects low-confidence text without code signals", async () => {
  const detector = createDetector([
    { language: "markdown", score: 0.37 },
    { language: "yaml", score: 0.1 },
  ]);
  const result = await detector.detect("A short ordinary sentence");
  expect(result).toBeUndefined();
});

test("recognizes high-confidence code without code signals", async () => {
  const detector = createDetector([
    { language: "yaml", score: 0.88 },
    { language: "markdown", score: 0.08 },
  ]);
  const result = await detector.detect("name: demo\nversion: latest");
  expect(result.language).toBe("yaml");
});

test("rejects medium-confidence results without code signals", async () => {
  const detector = createDetector([
    { language: "batch", score: 0.49 },
    { language: "shell", score: 0.12 },
  ]);
  const result = await detector.detect("echo hello world");
  expect(result).toBeUndefined();
});

test("recognizes short code without a character limit", async () => {
  const detector = createDetector([
    { language: "json", score: 0.8 },
    { language: "javascript", score: 0.1 },
  ]);
  const result = await detector.detect("{}");
  expect(result.language).toBe("json");
});

test("rejects an ambiguous top group", async () => {
  const detector = createDetector(
    [
      { language: "javascript", score: 0.55 },
      { language: "typescript", score: 0.48 },
      { language: "java", score: 0.4 },
      { language: "cpp", score: 0.25 },
      { language: "c", score: 0.15 },
    ],
    { detect: () => undefined },
  );
  const result = await detector.detect("const value = createValue<string>();");
  expect(result).toBeUndefined();
});

test("recognizes markdown when confidence is sufficient", async () => {
  const detector = createDetector(
    [
      { language: "markdown", score: 0.9 },
      { language: "yaml", score: 0.1 },
    ],
    { detect: () => undefined },
  );
  const result = await detector.detect("# Heading\n- first item\n- second item");
  expect(result.language).toBe("markdown");
  expect(result.source).toBe("betlang");
});

test("falls back to long-tail feature rules", async () => {
  const detector = createDetector([], new RuleDetector(available));
  const source = 'syntax = "proto3";\nmessage User {\n  repeated string names = 1;\n}';
  const result = await detector.detect(source);
  expect(result.language).toBe("protobuf");
  expect(result.source).toBe("rule");
});
