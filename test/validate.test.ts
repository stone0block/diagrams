import assert from "node:assert/strict";
import { test } from "node:test";
import { generateId, isValidId } from "../src/id.ts";
import { DEFAULT_TITLE, MAX_CODE_CHARS, MAX_TITLE_CHARS, firstKeyword, validateDiagram } from "../src/validate.ts";

test("accepts a plain flowchart and keeps the title", () => {
  const result = validateDiagram("flowchart TD\n  A --> B", "Login flow");
  assert.deepEqual(result, { ok: true, code: "flowchart TD\n  A --> B", title: "Login flow" });
});

test("empty or whitespace code is rejected with an explanation", () => {
  for (const input of ["", "   \n ", undefined, null, 42]) {
    const result = validateDiagram(input, "t");
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /empty/);
  }
});

test("code over the limit is rejected and says the limit", () => {
  const result = validateDiagram("flowchart TD\n" + "A-->B\n".repeat(MAX_CODE_CHARS), "t");
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, new RegExp(String(MAX_CODE_CHARS)));
});

test("unknown diagram type is rejected and the supported types are listed", () => {
  const result = validateDiagram("hello world", "t");
  assert.equal(result.ok, false);
  const error = (result as { error: string }).error;
  assert.match(error, /"hello"/);
  assert.match(error, /sequenceDiagram/);
});

test("front matter, directives and comments before the type are skipped", () => {
  const code = "---\ntitle: X\n---\n%%{init: {'theme': 'dark'}}%%\n%% a comment\n\nsequenceDiagram\n  A->>B: hi";
  assert.equal(firstKeyword(code), "sequenceDiagram");
  assert.equal(validateDiagram(code, "t").ok, true);
});

test("keywords with a hyphen or a trailing colon are recognised", () => {
  assert.equal(validateDiagram("stateDiagram-v2\n  [*] --> A", "t").ok, true);
  assert.equal(validateDiagram("gitGraph:\n  commit", "t").ok, true);
  assert.equal(validateDiagram("erDiagram\n  A ||--o{ B : has", "t").ok, true);
});

test("Windows line endings are normalised", () => {
  const result = validateDiagram("flowchart TD\r\n  A --> B\r\n", "t");
  assert.equal(result.ok && result.code, "flowchart TD\n  A --> B");
});

test("missing or blank title falls back to the default, control characters are removed", () => {
  assert.equal(validateDiagram("graph TD\nA-->B", undefined).ok && (validateDiagram("graph TD\nA-->B", undefined) as { title: string }).title, DEFAULT_TITLE);
  const blank = validateDiagram("graph TD\nA-->B", "  \n ");
  assert.equal(blank.ok && blank.title, DEFAULT_TITLE);
  const messy = validateDiagram("graph TD\nA-->B", "A\u0000B\n  C");
  assert.equal(messy.ok && messy.title, "A B C");
});

test("title over the limit is rejected", () => {
  const result = validateDiagram("graph TD\nA-->B", "x".repeat(MAX_TITLE_CHARS + 1));
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /title/);
});

test("russian text in code and title passes", () => {
  const result = validateDiagram("flowchart TD\n  A[Начало] --> B[Конец]", "Процесс заказа");
  assert.equal(result.ok, true);
});

test("ids are 12 chars, valid, and differ", () => {
  const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
  assert.equal(ids.size, 1000);
  for (const id of ids) {
    assert.equal(id.length, 12);
    assert.equal(isValidId(id), true);
  }
});

test("isValidId rejects short ids and odd characters", () => {
  assert.equal(isValidId("short"), false);
  assert.equal(isValidId("abc/../etc/passwd"), false);
  assert.equal(isValidId("ABCDEFGHJKMN"), false);
});
