import { describe, it, expect, beforeAll } from "vitest";

// markdown.js is a browser IIFE that exports via module.exports (when the
// bundler/test runner provides one) or window.ASYNCAPI_MD (real browsers).
let md: { render: (s: string) => string };

beforeAll(async () => {
  (globalThis as Record<string, unknown>).window = {};
  // @ts-expect-error -- browser IIFE without type declarations
  const mod = (await import("../chat/markdown.js")) as Partial<typeof md> & {
    default?: Partial<typeof md>;
  };
  const win = (globalThis as { window: { ASYNCAPI_MD?: typeof md } }).window;
  md = (mod.render ? mod : (mod.default?.render ? mod.default : win.ASYNCAPI_MD)) as typeof md;
});

describe("fenced code blocks", () => {
  const yamlSample = [
    "Here is an example:",
    "",
    "```yaml",
    "asyncapi: 3.0.0   # spec version",
    "channels:",
    "  - name: user/signedup",
    "```",
  ].join("\n");

  it("renders a fenced block as <pre><code>, not literal backticks", () => {
    const html = md.render(yamlSample);
    expect(html).toContain("<pre><code");
    expect(html).toContain("</code></pre>");
    expect(html).not.toContain("```");
  });

  it("does not reinterpret code content as markdown", () => {
    const html = md.render(yamlSample);
    // "- name:" must stay code, not become a <ul><li>
    expect(html).not.toContain("<ul>");
    // "# spec version" must stay code, not become a heading
    expect(html).not.toContain("md-h");
  });

  it("preserves line breaks and indentation inside code", () => {
    const html = md.render(yamlSample);
    expect(html).toContain("channels:\n  - name: user/signedup");
  });

  it("adds a language class for a valid info string", () => {
    expect(md.render("```yaml\na: 1\n```")).toContain('class="language-yaml"');
  });

  it("omits the class when no language is given", () => {
    const html = md.render("```\nplain\n```");
    expect(html).toContain("<pre><code>plain");
  });

  it("HTML-escapes code content", () => {
    const html = md.render('```html\n<script>alert("x")</script>\n```');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not apply inline transforms inside code", () => {
    const html = md.render("```\n**not bold** `not inline` https://not-a-link.example\n```");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<a ");
    expect(html).toContain("**not bold**");
  });

  it("renders an unclosed fence as code (graceful end-of-message)", () => {
    const html = md.render("Intro\n\n```json\n{\"a\": 1}");
    expect(html).toContain("<pre><code");
    expect(html).toContain("&quot;a&quot;: 1");
    expect(html).not.toContain("```");
  });

  it("keeps surrounding markdown working around fences", () => {
    const html = md.render("**bold** before\n\n```\ncode\n```\n\n- item after");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<pre><code>code");
    expect(html).toContain("<li>item after</li>");
  });

  it("handles two fences in one message independently", () => {
    const html = md.render("```\none\n```\nbetween\n```\ntwo\n```");
    const blocks = html.match(/<pre><code/g) || [];
    expect(blocks.length).toBe(2);
    expect(html).toContain("<p>between</p>");
  });

  it("ignores a malicious info string (no attribute injection)", () => {
    const html = md.render('```yaml" onmouseover="alert(1)\ncode\n```');
    expect(html).not.toContain("onmouseover");
  });
});

describe("existing behavior unchanged", () => {
  it("still renders inline code", () => {
    expect(md.render("use `asyncapi validate`")).toContain("<code>asyncapi validate</code>");
  });

  it("still renders lists, headings, bold", () => {
    const html = md.render("## Title\n\n- a\n- b\n\n**strong**");
    expect(html).toContain('class="md-h"');
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<strong>strong</strong>");
  });
});
