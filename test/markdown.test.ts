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

describe("nested lists", () => {
  it("nests an indented sub-item inside its parent <li>", () => {
    const html = md.render("- parent\n  - child\n- parent2");
    expect(html).toBe(
      "<ul><li>parent<ul><li>child</li></ul></li><li>parent2</li></ul>"
    );
  });

  it("nests multiple levels deep", () => {
    const html = md.render("- a\n  - b\n    - c");
    expect(html).toBe(
      "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>"
    );
  });

  it("nests an ordered list inside an unordered item", () => {
    const html = md.render("- a\n  1. one\n  2. two");
    expect(html).toBe(
      "<ul><li>a<ol><li>one</li><li>two</li></ol></li></ul>"
    );
  });

  it("dedents back to the outer level", () => {
    const html = md.render("- a\n  - b\n- c");
    expect(html).toBe("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
  });

  it("keeps a flat list flat", () => {
    expect(md.render("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
  });
});

describe("indented code blocks", () => {
  const sample = ["Intro", "", "    operations:", "      pingRequest:"].join("\n");

  it("renders a 4-space indented block as <pre><code>", () => {
    const html = md.render(sample);
    expect(html).toContain("<pre><code>operations:\n  pingRequest:</code></pre>");
  });

  it("does not render indented code as a paragraph", () => {
    const html = md.render(sample);
    expect(html).not.toContain("<p>operations");
  });

  it("strips only the first four columns of indentation", () => {
    const html = md.render("    a\n        b");
    expect(html).toContain("<pre><code>a\n    b</code></pre>");
  });

  it("treats a leading tab as code indentation", () => {
    const html = md.render("\toperations:");
    expect(html).toContain("<pre><code>operations:</code></pre>");
  });

  it("does not apply inline transforms inside indented code", () => {
    const html = md.render("    use `replyTo` and **bold**");
    expect(html).toContain("<pre><code>use `replyTo` and **bold**</code></pre>");
    expect(html).not.toContain("<code>replyTo</code>");
    expect(html).not.toContain("<strong>");
  });

  it("HTML-escapes indented code content", () => {
    const html = md.render('    <script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps interior blank lines but drops trailing ones", () => {
    const html = md.render("    a\n\n    b\n\nafter");
    expect(html).toContain("<pre><code>a\n\nb</code></pre>");
    expect(html).toContain("<p>after</p>");
  });

  it("renders indented code that follows a list", () => {
    const html = md.render("- pattern:\n\n    operations:\n      ping:");
    expect(html).toContain("<li>pattern:</li>");
    expect(html).toContain("<pre><code>operations:\n  ping:</code></pre>");
  });

  it("does not treat a single sub-4-space indent as code", () => {
    const html = md.render("Intro\n\n  still a paragraph");
    expect(html).not.toContain("<pre>");
    expect(html).toContain("still a paragraph");
  });
});

describe("links wrapped across lines", () => {
  it("reunites a link whose URL was wrapped onto the next line", () => {
    const html = md.render(
      "- Stay informed: [Governance principles / duties](\nhttps://www.asyncapi.com/docs/community/020-governance-and-policies/TSC_MEMBERSHIP)"
    );
    expect(html).toContain(
      '<a href="https://www.asyncapi.com/docs/community/020-governance-and-policies/TSC_MEMBERSHIP"'
    );
    expect(html).toContain(">Governance principles / duties</a>");
    // no leftover literal "](" and no stray autolink line
    expect(html).not.toContain("](");
    expect(html).not.toContain("<p>https://");
  });

  it("handles a closing paren wrapped onto the next line", () => {
    const html = md.render("[foo](https://example.com/path\n) tail");
    expect(html).toContain('<a href="https://example.com/path"');
    expect(html).toContain(">foo</a>");
    expect(html).toContain("tail");
  });

  it("leaves an inline link untouched", () => {
    const html = md.render(
      "see [TSC](https://www.asyncapi.com/docs/community/020-governance-and-policies/TSC_MEMBERSHIP) now"
    );
    expect(html).toContain(">TSC</a>");
  });

  it("does not collapse non-link parens", () => {
    const html = md.render("array[0]( not a url ) stays");
    expect(html).toContain("array[0]( not a url ) stays");
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
