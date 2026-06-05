/* ============================================================
   Minimal, dependency-free markdown renderer for chat answers.
   All input is HTML-escaped first — the model's output can never
   inject markup. Supports: headings, bold, italic, inline code,
   fenced code blocks (```lang), [text](url) links, bare https://
   autolinks, ul/ol lists.
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

  function render(md) {
    var html = [];
    var para = [];
    var list = null; // { type: "ul"|"ol", items: [] }
    var fence = null; // { lang: string, lines: [] }

    function flushPara() {
      if (para.length) {
        html.push("<p>" + para.join("<br>") + "</p>");
        para = [];
      }
    }
    function flushList() {
      if (list) {
        html.push(
          "<" + list.type + ">" +
            list.items.map(function (i) { return "<li>" + i + "</li>"; }).join("") +
            "</" + list.type + ">"
        );
        list = null;
      }
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

    String(md).split(/\r?\n/).forEach(function (line) {
      var f = line.match(/^\s*```\s*(\S*).*$/);
      if (fence) {
        if (f) flushFence();
        else fence.lines.push(line);
        return;
      }
      if (f) {
        flushPara(); flushList();
        fence = { lang: f[1], lines: [] };
        return;
      }
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      var ul = line.match(/^\s*[-*]\s+(.*)$/);
      var ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (!line.trim()) {
        flushPara(); flushList();
      } else if (h) {
        flushPara(); flushList();
        html.push('<p class="md-h">' + inline(escapeHtml(h[2])) + "</p>");
      } else if (ul) {
        flushPara();
        if (list && list.type !== "ul") flushList();
        list = list || { type: "ul", items: [] };
        list.items.push(inline(escapeHtml(ul[1])));
      } else if (ol) {
        flushPara();
        if (list && list.type !== "ol") flushList();
        list = list || { type: "ol", items: [] };
        list.items.push(inline(escapeHtml(ol[1])));
      } else {
        flushList();
        para.push(inline(escapeHtml(line)));
      }
    });
    flushPara(); flushList();
    flushFence(); // unclosed fence at end of message still renders as code
    return html.join("");
  }

  exports.render = render;
})(typeof module !== "undefined" && module.exports ? module.exports : (window.ASYNCAPI_MD = {}));
