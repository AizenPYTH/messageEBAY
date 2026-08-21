import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectLanguage } from "./detectLanguage.js";

describe("detectLanguage", () => {
  it("keeps French for short FR questions with the word compatible", () => {
    const d = detectLanguage("Juste elle et compatible partout ?");
    assert.equal(d.code, "fr");
  });

  it("detects clear English", () => {
    const d = detectLanguage("Hello, is shipping free please?");
    assert.equal(d.code, "en");
  });

  it("defaults empty to French", () => {
    assert.equal(detectLanguage("").code, "fr");
  });
});
