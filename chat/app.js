/* ============================================================
   AsyncAPI Knowledge chat — ephemeral static client.
   Conversation lives only in memory; nothing is persisted.
   ============================================================ */
(function () {
  "use strict";

  var CONFIG = window.CHAT_CONFIG || {};
  var ENDPOINT = CONFIG.endpoint || "/api/chat";

  // Ephemeral conversation (in-memory only).
  var conversation = [];

  var transcript = document.getElementById("transcript");
  var emptyState = document.getElementById("emptyState");
  var form = document.getElementById("composer");
  var input = document.getElementById("input");
  var sendBtn = document.getElementById("send");
  var optIn = document.getElementById("analyticsOptIn");

  /* ---------- "Use it in your own tools" panel ---------- */
  var toolsToggle = document.getElementById("toolsToggle");
  var toolsPanel = document.getElementById("toolsPanel");

  toolsToggle.addEventListener("click", function () {
    var open = toolsPanel.hasAttribute("hidden");
    if (open) {
      toolsPanel.removeAttribute("hidden");
    } else {
      toolsPanel.setAttribute("hidden", "");
    }
    toolsToggle.setAttribute("aria-expanded", String(open));
    if (open) toolsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // The demo-note "run it locally" link opens the tools panel.
  var demoToolsLink = document.getElementById("demoToolsLink");
  if (demoToolsLink) {
    demoToolsLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (toolsPanel.hasAttribute("hidden")) toolsToggle.click();
      else toolsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  // Copy-to-clipboard buttons.
  document.querySelectorAll(".btn--copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = document.getElementById(btn.getAttribute("data-copy"));
      if (!target) return;
      var text = target.textContent;
      var done = function () {
        var orig = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("is-copied");
        setTimeout(function () {
          btn.textContent = orig;
          btn.classList.remove("is-copied");
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
      } else {
        legacyCopy(text);
        done();
      }
    });
  });

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  /* ---------- Suggestion chips ---------- */
  document.querySelectorAll(".chip--suggest").forEach(function (chip) {
    chip.addEventListener("click", function () {
      input.value = chip.getAttribute("data-suggest") || chip.textContent;
      autosize();
      input.focus();
    });
  });

  /* ---------- Textarea autosize ---------- */
  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }
  input.addEventListener("input", autosize);

  // On mobile the composer is sticky to the bottom of the screen; when the
  // on-screen keyboard opens it can cover the field, so nudge it into view.
  input.addEventListener("focus", function () {
    setTimeout(function () {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  });

  // The single-row pill can't show a placeholder that wraps to two lines, so
  // use a shorter one on narrow screens (the long copy gets clipped otherwise).
  var narrow = window.matchMedia("(max-width: 560px)");
  var phPlaceholder = "Ask about AsyncAPI…";
  var fullPlaceholder = input.getAttribute("placeholder");
  function setPlaceholder() {
    input.setAttribute("placeholder", narrow.matches ? phPlaceholder : fullPlaceholder);
  }
  setPlaceholder();
  narrow.addEventListener("change", setPlaceholder);

  /* ---------- Rendering ---------- */
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  // The transcript grows with the conversation, so we scroll the page (not an
  // inner box). Bring a new turn to the top of the viewport so the answer that
  // appears below it reads from the top.
  function scrollTurnToTop(wrap) {
    if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearEmptyState() {
    if (emptyState && emptyState.parentNode) emptyState.parentNode.removeChild(emptyState);
  }

  function renderMessage(role, content) {
    var wrap = el("div", "msg msg--" + role);
    wrap.appendChild(el("span", "msg__role", role === "user" ? "You" : "AsyncAPI Knowledge"));
    var bubble;
    if (role === "assistant" && window.ASYNCAPI_MD) {
      bubble = el("div", "msg__bubble msg__bubble--md");
      bubble.innerHTML = window.ASYNCAPI_MD.render(content);
    } else {
      bubble = el("div", "msg__bubble", content);
    }
    wrap.appendChild(bubble);
    transcript.appendChild(wrap);
    return wrap;
  }

  function renderCitations(parent, citations) {
    if (!Array.isArray(citations) || citations.length === 0) return;
    var box = el("div", "citations");
    box.appendChild(el("span", "citations__label", "Sources"));
    var row = el("div", "citations__row");
    citations.forEach(function (c) {
      if (!c || !c.url) return;
      if (!/^https?:\/\//i.test(c.url)) return;
      var chip = el("a", "citation-chip", c.title || c.source_name || c.url);
      if (c.title && c.source_name) chip.title = c.source_name;
      chip.href = c.url;
      chip.target = "_blank";
      chip.rel = "noopener noreferrer";
      row.appendChild(chip);
    });
    if (row.children.length) {
      box.appendChild(row);
      parent.appendChild(box);
    }
  }

  function renderError(message) {
    var wrap = el("div", "msg msg--assistant");
    wrap.appendChild(el("span", "msg__role", "AsyncAPI Knowledge"));
    var bubble = el("div", "msg__bubble msg__bubble--error", message);
    wrap.appendChild(bubble);
    transcript.appendChild(wrap);
  }

  /* ---------- Staged loader ---------- */
  function showLoader() {
    var loader = el("div", "loader");
    var bubble = el("div", "loader__bubble");
    var dots = el("span", "loader__dots");
    dots.appendChild(el("span"));
    dots.appendChild(el("span"));
    dots.appendChild(el("span"));
    var label = el("span", "loader__label", "Searching the AsyncAPI docs…");
    bubble.appendChild(dots);
    bubble.appendChild(label);
    loader.appendChild(bubble);
    transcript.appendChild(loader);

    var timer = setTimeout(function () {
      label.textContent = "Writing the answer…";
    }, 1400);

    return {
      done: function () {
        clearTimeout(timer);
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      },
    };
  }

  /* ---------- Send ---------- */
  var inFlight = false;

  async function send(text) {
    if (inFlight) return;
    var question = (text != null ? text : input.value).trim();
    if (!question) return;

    clearEmptyState();
    var userTurn = renderMessage("user", question);
    scrollTurnToTop(userTurn);
    conversation.push({ role: "user", content: question });

    input.value = "";
    autosize();
    inFlight = true;
    sendBtn.disabled = true;

    var loader = showLoader();

    try {
      var res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: conversation.slice(),
          analyticsOptIn: !!(optIn && optIn.checked),
        }),
      });

      if (!res.ok) {
        var status = res.status;
        throw new Error("http_" + status);
      }

      var data = await res.json();
      var answer = (data && typeof data.answer === "string") ? data.answer : "";
      var citations = (data && Array.isArray(data.citations)) ? data.citations : [];

      if (!answer) throw new Error("empty_answer");

      var bubble = renderMessage("assistant", answer);
      renderCitations(bubble, citations);
      conversation.push({ role: "assistant", content: answer });
    } catch (err) {
      // Pop the user message so a retry re-adds it cleanly.
      conversation.pop();
      if (err instanceof TypeError) {
        renderError(
          "Couldn’t reach the assistant — check your connection and try again."
        );
      } else {
        var httpMatch = err.message && err.message.match(/^http_(\d+)$/);
        if (httpMatch) {
          renderError(
            "The assistant had a problem answering (HTTP " + httpMatch[1] + "). Please try again in a moment."
          );
        } else {
          renderError(
            "The assistant had a problem answering. Please try again in a moment."
          );
        }
      }
    } finally {
      loader.done();
      inFlight = false;
      sendBtn.disabled = false;
      // preventScroll: keep the answer in view (the question is pinned to the
      // top) instead of jumping the page down to the composer.
      input.focus({ preventScroll: true });
    }
  }

  /* ---------- Events ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send();
  });

  // Enter sends; Shift+Enter inserts a newline.
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
})();
