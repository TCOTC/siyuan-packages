import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const parseTopLanguage = (output: string) => output.trim().split("\n", 1)[0].split(":", 1)[0];

test("the bundled betlang wasm recognizes representative languages", async () => {
  const modulePath = fileURLToPath(new URL("../wasm/betlang_wasm.js", import.meta.url));
  const wasmPath = fileURLToPath(new URL("../wasm/betlang_wasm_bg.wasm", import.meta.url));
  const betlang = (await import(pathToFileURL(modulePath).href)) as {
    default(options: { module_or_path: Buffer }): Promise<unknown>;
    detect_scores(source: string): string;
  };
  const wasm = await readFile(wasmPath);
  await betlang.default({ module_or_path: wasm });

  const cases: [string, string][] = [
    ["rust", 'use std::collections::HashMap;\nfn main() { let mut values: HashMap<String, usize> = HashMap::new(); values.insert("a".into(), 1); }'],
    ["go", 'package main\nimport "fmt"\nfunc main() { values := []int{1, 2, 3}; fmt.Println(values) }'],
    ["python", "from pathlib import Path\ndef collect(root: Path) -> list[str]:\n    return [item.name for item in root.iterdir() if item.is_file()]"],
    ["html", "<span>234234</span>\n<span>2342343</span>\n<div>23</div>"],
  ];
  for (const [expected, source] of cases) {
    expect(parseTopLanguage(betlang.detect_scores(source))).toBe(expected);
  }
});
