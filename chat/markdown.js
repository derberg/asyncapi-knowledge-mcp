/* ============================================================
   Minimal, dependency-free markdown renderer for chat answers.
   All input is HTML-escaped first — the model's output can never
   inject markup. Supports: headings, bold, italic, inline code,
   fenced code blocks (```lang), 4-space/tab indented code blocks,
   [text](url) links, bare https:// autolinks, and nested ul/ol lists.
   ============================================================ */
(function (exports) {
  "use strict";

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function anchor(url, label) {
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
  }

  // Inline transforms on an already-escaped line.
  function inline(s) {
    var parts = s.split(/(`[^`]+`)/);
    return parts
      .map(function (p) {
        // p is already HTML-escaped (whole line escaped before inline transforms) — do NOT escape again.
        if (/^`[^`]+`$/.test(p)) return "<code>" + p.slice(1, -1) + "</code>";
        // [text](https://url) — http(s) only
        p = p.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, url) {
          return anchor(url, label);
        });
        // bare URLs (not the ones already inside href="..." — those are
        // preceded by a quote, which this pattern rejects)
        p = p.replace(/(^|[\s(])(https?:\/\/[^\s<)]+?)([.,;:]?)(?=[\s)]|$)/g, function (m, pre, url, trail) {
          return pre + anchor(url, url) + trail;
        });
        p = p.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        p = p.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
        return p;
      })
      .join("");
  }

  // Column width of a leading-whitespace string (tab = 4 columns).
  function colOf(ws) {
    var col = 0;
    for (var i = 0; i < ws.length; i++) col += ws[i] === "\t" ? 4 : 1;
    return col;
  }
  // Column count of a line's leading whitespace.
  function leadingCol(line) {
    return colOf(line.match(/^[ \t]*/)[0]);
  }
  // Drop up to four columns of leading whitespace (an indented-code-block
  // marker); deeper indentation is preserved so relative structure survives.
  function stripIndent(line) {
    var removed = 0, i = 0;
    while (i < line.length && removed < 4) {
      if (line[i] === " ") removed += 1;
      else if (line[i] === "\t") removed += 4;
      else break;
      i++;
    }
    return line.slice(i);
  }

  function render(md) {
    var html = [];
    var para = [];
    var listRoot = null; // root list frame: { type, indent, items: [{text, sub}] }
    var listStack = [];  // open frames, outermost..innermost
    var fence = null; // { lang: string, lines: [] }
    var code = null;  // indented code block: { lines: [], blanks: number }

    function flushPara() {
      if (para.length) {
        html.push("<p>" + para.join("<br>") + "</p>");
        para = [];
      }
    }
    function frameHtml(frame) {
      var out = "<" + frame.type + ">";
      for (var i = 0; i < frame.items.length; i++) {
        var it = frame.items[i];
        out += "<li>" + it.text + (it.sub ? frameHtml(it.sub) : "") + "</li>";
      }
      return out + "</" + frame.type + ">";
    }
    function flushList() {
      if (listRoot) {
        html.push(frameHtml(listRoot));
        listRoot = null;
        listStack = [];
      }
    }
    // Place a list item at the given indent column, opening or closing nested
    // lists as the indentation grows or shrinks.
    function addItem(type, indent, text) {
      if (!listRoot) {
        listRoot = { type: type, indent: indent, items: [] };
        listStack = [listRoot];
      }
      // Dedent: close frames deeper than this item.
      while (listStack.length > 1 && indent < listStack[listStack.length - 1].indent) {
        listStack.pop();
      }
      var top = listStack[listStack.length - 1];
      if (indent > top.indent) {
        // Indent: open a nested list inside the previous item.
        var parentItem = top.items[top.items.length - 1] || (top.items.push({ text: "", sub: null }), top.items[0]);
        var child = { type: type, indent: indent, items: [] };
        parentItem.sub = child;
        listStack.push(child);
        top = child;
      } else if (indent === top.indent && type !== top.type && listStack.length === 1) {
        // A different list type at the root level is a separate list.
        flushList();
        listRoot = { type: type, indent: indent, items: [] };
        listStack = [listRoot];
        top = listRoot;
      }
      top.items.push({ text: text, sub: null });
    }
    function flushFence() {
      if (fence) {
        // Only a plain identifier becomes a class — anything else is dropped,
        // so the info string can never inject attributes.
        var cls = /^[A-Za-z0-9_+-]+$/.test(fence.lang)
          ? ' class="language-' + fence.lang + '"'
          : "";
        html.push("<pre><code" + cls + ">" + fence.lines.map(escapeHtml).join("\n") + "</code></pre>");
        fence = null;
      }
    }
    function flushCode() {
      if (code) {
        html.push("<pre><code>" + code.lines.map(escapeHtml).join("\n") + "</code></pre>");
        code = null;
      }
    }

    String(md).split(/\r?\n/).forEach(function (line) {
      var f = line.match(/^\s*```\s*(\S*).*$/);
      if (fence) {
        if (f) flushFence();
        else fence.lines.push(line);
        return;
      }
      // Inside an indented code block: blank lines are buffered (kept only if
      // more code follows), an indented line continues it, anything else ends it.
      if (code) {
        if (!line.trim()) { code.blanks++; return; }
        if (leadingCol(line) >= 4 && !f) {
          while (code.blanks > 0) { code.lines.push(""); code.blanks--; }
          code.lines.push(stripIndent(line));
          return;
        }
        flushCode();
      }
      if (f) {
        flushPara(); flushList();
        fence = { lang: f[1], lines: [] };
        return;
      }
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      var ul = line.match(/^(\s*)[-*]\s+(.*)$/);
      var ol = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
      if (!line.trim()) {
        flushPara(); flushList();
      } else if (h) {
        flushPara(); flushList();
        html.push('<p class="md-h">' + inline(escapeHtml(h[2])) + "</p>");
      } else if (ul) {
        flushPara();
        addItem("ul", colOf(ul[1]), inline(escapeHtml(ul[2])));
      } else if (ol) {
        flushPara();
        addItem("ol", colOf(ol[1]), inline(escapeHtml(ol[2])));
      } else if (leadingCol(line) >= 4 && !para.length) {
        // Indented code block — but it cannot interrupt a running paragraph.
        flushList();
        code = { lines: [stripIndent(line)], blanks: 0 };
      } else {
        flushList();
        para.push(inline(escapeHtml(line)));
      }
    });
    flushPara(); flushList();
    flushFence(); // unclosed fence at end of message still renders as code
    flushCode();
    return html.join("");
  }

  exports.render = render;
})(typeof module !== "undefined" && module.exports ? module.exports : (window.ASYNCAPI_MD = {}));
