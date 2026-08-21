import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripHtml } from "./xml.js";

describe("stripHtml for chat bodies", () => {
  it("turns br/p into newlines and drops tags", () => {
    const text = stripHtml(
      "<div>Bonjour<br>est-ce dispo ?</div><p>Merci</p>",
    );
    assert.match(text, /Bonjour/);
    assert.match(text, /est-ce dispo/);
    assert.doesNotMatch(text, /</);
  });

  it("decodes entities", () => {
    assert.equal(stripHtml("A &amp; B"), "A & B");
  });
});
