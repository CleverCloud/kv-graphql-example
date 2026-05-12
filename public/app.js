// Vanilla JS — no framework. Renders the scenario list, runs scenarios, and
// progressively reveals the captured Redis and GraphQL events.

const $ = (selector) => document.querySelector(selector);

const dom = {
  scenarioList: $("#scenario-list"),
  scenarioCount: $("#scenario-count"),
  redisPortLabel: $("#redis-port-label"),
  emptyState: $("#empty-state"),
  result: $("#result"),
  eyebrow: $("#result-eyebrow"),
  title: $("#result-title"),
  summary: $("#result-summary"),
  narrative: $("#result-narrative"),
  footerText: $("#result-footer-text"),
  redisEvents: $("#redis-events"),
  graphqlEvents: $("#graphql-events"),
  spinnerRedis: $("#spinner-redis"),
  spinnerGraphQL: $("#spinner-graphql"),
  runId: $("#run-id"),
  runTime: $("#run-time"),
  btnRerun: $("#btn-rerun"),
  status: $("#status-region"),
};

const EVENT_STAGGER_MS = 200;

const state = {
  scenarios: [],
  currentId: null,
  runCounter: 0,
  runToken: 0,
};

// ─── Tiny DOM helpers ────────────────────────────────────────────────────
const text = (s) => document.createTextNode(s);
const el = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const formatTime = (ms) => {
  const d = new Date(ms);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

// Inline-code highlighter for scenario summaries — uses textContent for safety
// then upgrades `…` spans to <code> nodes.
const renderInlineCode = (target, value) => {
  target.replaceChildren();
  for (const part of value.split(/(`[^`]+`)/)) {
    if (part.startsWith("`") && part.endsWith("`")) {
      target.appendChild(el("code", null, part.slice(1, -1)));
    } else if (part) {
      target.appendChild(text(part));
    }
  }
};

// ─── Scenario list ───────────────────────────────────────────────────────
const loadScenarios = async () => {
  const [scenarios, info] = await Promise.all([
    fetch("/api/scenarios").then((r) => r.json()),
    fetch("/api/info").then((r) => r.json()).catch(() => null),
  ]);
  state.scenarios = scenarios;
  dom.scenarioCount.textContent = String(scenarios.length).padStart(2, "0");
  if (info?.redisPort) dom.redisPortLabel.textContent = `:${info.redisPort}`;
  dom.scenarioList.replaceChildren(...scenarios.map(renderScenarioListItem));
};

const renderScenarioListItem = (s, i) => {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "scenario-btn";
  btn.type = "button";
  btn.dataset.id = s.id;
  btn.setAttribute("aria-label", `Run scenario ${i + 1}: ${s.title}`);
  btn.append(
    el("span", "scenario-play", "▶"),
    el("span", "scenario-num", String(i + 1).padStart(2, "0")),
    el("span", "scenario-name", s.shortTitle),
    el("span", "scenario-arrow", "→"),
  );
  // Visual-only spans don't need to be announced.
  btn.querySelector(".scenario-play").setAttribute("aria-hidden", "true");
  btn.querySelector(".scenario-num").setAttribute("aria-hidden", "true");
  btn.querySelector(".scenario-arrow").setAttribute("aria-hidden", "true");
  li.appendChild(btn);
  return li;
};

const setRunningButton = (id) => {
  for (const other of dom.scenarioList.querySelectorAll(".scenario-btn")) {
    if (other.dataset.id === id) {
      other.setAttribute("aria-current", "true");
      other.classList.add("running");
    } else {
      other.removeAttribute("aria-current");
      other.classList.remove("running");
    }
  }
};

const setButtonsDisabled = (disabled) => {
  for (const btn of dom.scenarioList.querySelectorAll(".scenario-btn")) {
    btn.disabled = disabled;
  }
  dom.btnRerun.disabled = disabled;
};

dom.scenarioList.addEventListener("click", (e) => {
  const btn = e.target.closest(".scenario-btn");
  if (!btn || btn.disabled) return;
  runScenario(btn.dataset.id);
});

dom.btnRerun.addEventListener("click", () => {
  if (state.currentId) runScenario(state.currentId);
});

// ─── Run a scenario ──────────────────────────────────────────────────────
const runScenario = async (id) => {
  state.currentId = id;
  state.runCounter += 1;
  const thisRun = ++state.runToken;

  const meta = state.scenarios.find((s) => s.id === id);
  setRunningButton(id);
  setButtonsDisabled(true);
  showRunningState(meta);

  try {
    const res = await fetch(`/api/scenarios/${id}`, { method: "POST" });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON failure body */ }
    if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
    if (thisRun !== state.runToken) return;
    await renderProgressive(body);
  } catch (err) {
    if (thisRun === state.runToken) {
      const btn = dom.scenarioList.querySelector(`.scenario-btn[data-id="${id}"]`);
      btn?.classList.remove("running");
      setButtonsDisabled(false);
      showError(err?.message || "Scenario failed");
      return;
    }
  } finally {
    if (thisRun === state.runToken) {
      const btn = dom.scenarioList.querySelector(`.scenario-btn[data-id="${id}"]`);
      btn?.classList.remove("running");
      setButtonsDisabled(false);
    }
  }
};

const showRunningState = (meta) => {
  dom.emptyState.hidden = true;
  dom.result.hidden = false;
  dom.result.classList.remove("has-error");
  dom.result.setAttribute("aria-busy", "true");

  const index = state.scenarios.findIndex((s) => s.id === meta?.id);
  dom.eyebrow.textContent = `SCENARIO ${index >= 0 ? String(index + 1).padStart(2, "0") : "—"}`;
  dom.title.textContent = meta?.title ?? "…";
  renderInlineCode(dom.summary, meta?.summary ?? "");
  dom.narrative.textContent = meta?.narrative ?? "";

  dom.redisEvents.replaceChildren();
  dom.graphqlEvents.replaceChildren();
  dom.footerText.textContent = "";
  dom.spinnerRedis.hidden = false;
  dom.spinnerGraphQL.hidden = false;
  dom.runId.textContent = `Run #${state.runCounter}`;
  dom.runTime.textContent = formatTime(Date.now());
  dom.status.textContent = `Running ${meta?.title ?? "scenario"}…`;
};

const showError = (message) => {
  dom.result.setAttribute("aria-busy", "false");
  dom.result.classList.add("has-error");
  dom.spinnerRedis.hidden = true;
  dom.spinnerGraphQL.hidden = true;
  dom.title.textContent = "Scenario failed";
  dom.summary.textContent = message;
  dom.narrative.textContent = "";
  dom.status.textContent = `Scenario failed: ${message}`;
  dom.btnRerun.focus();
};

// ─── Progressive rendering ───────────────────────────────────────────────
const renderProgressive = async (scenario) => {
  dom.redisEvents.replaceChildren();
  dom.graphqlEvents.replaceChildren();

  const events = [...scenario.events].sort((a, b) => a.timestamp - b.timestamp);

  for (const event of events) {
    const target = event.protocol === "redis" ? dom.redisEvents : dom.graphqlEvents;
    target.appendChild(renderEvent(event));
    await sleep(EVENT_STAGGER_MS);
  }

  dom.result.setAttribute("aria-busy", "false");
  dom.spinnerRedis.hidden = true;
  dom.spinnerGraphQL.hidden = true;

  const totalMs = events.reduce((sum, e) => sum + e.durationMs, 0);
  const redisCount = events.filter((e) => e.protocol === "redis").length;
  const graphqlCount = events.filter((e) => e.protocol === "graphql").length;
  dom.footerText.replaceChildren(
    el("span", "hi", String(redisCount)), text(` Redis command${redisCount === 1 ? "" : "s"} · `),
    el("span", "hi", String(graphqlCount)), text(` GraphQL quer${graphqlCount === 1 ? "y" : "ies"} · `),
    el("span", "hi", `${totalMs.toFixed(0)} ms`), text(" on the wire"),
  );
  dom.status.textContent = `${scenario.title}: ${redisCount} Redis command${redisCount === 1 ? "" : "s"}, ${graphqlCount} GraphQL quer${graphqlCount === 1 ? "y" : "ies"}, ${totalMs.toFixed(0)} ms total.`;
};

const renderEvent = (event) => {
  const root = el("article", `event ${event.protocol}${event.status === "error" ? " error" : ""}`);

  const header = el("div", "event-header");
  const time = el("time", "event-timestamp", formatTime(event.timestamp));
  time.setAttribute("datetime", new Date(event.timestamp).toISOString());
  header.append(el("span", "event-cmd", event.command), time);
  root.appendChild(header);

  const code = el("pre", "event-code");
  if (event.protocol === "redis") renderRedis(code, event.command, event.args ?? []);
  else renderGraphQL(code, event.args ?? []);
  root.appendChild(code);

  if (event.status === "error") {
    root.appendChild(el("div", "event-error", `⚠ ${event.error}`));
  } else {
    const body = formatResponseBody(event.response);
    if (body !== null) {
      const wrap = el("div", "event-response");
      wrap.append(el("div", "response-label", "response"), el("pre", null, body));
      root.appendChild(wrap);
    }
  }

  const meta = el("div", "event-meta");
  meta.appendChild(el("span", "duration", `${event.durationMs.toFixed(0)} ms`));
  root.appendChild(meta);
  return root;
};

const formatResponseBody = (response) => {
  if (response == null) return null;
  if (typeof response === "string") return JSON.stringify(response);
  if (typeof response === "number" || typeof response === "boolean") return String(response);
  try { return JSON.stringify(response, null, 2); }
  catch { return String(response); }
};

// ─── Token renderers (textContent only — no innerHTML) ───────────────────
const renderRedis = (target, command, args) => {
  target.appendChild(el("span", "tok-cmd", command));
  for (const a of args) {
    target.appendChild(text(" "));
    target.appendChild(
      typeof a === "number"
        ? el("span", "tok-number", String(a))
        : el("span", "tok-string", JSON.stringify(String(a))),
    );
  }
};

// Match keywords, $variables, and TypeName tokens at the top level of the
// query string. This is a deliberately simple highlighter — not a parser.
const GQL_TOKEN = /(\b(?:query|mutation|subscription|fragment)\b)|(\$\w+)|([A-Z]\w*!?)/g;

const renderGraphQL = (target, args) => {
  const query = String(args[0] ?? "");
  const variables = args[1];

  let lastIndex = 0;
  for (const match of query.matchAll(GQL_TOKEN)) {
    if (match.index > lastIndex) target.appendChild(text(query.slice(lastIndex, match.index)));
    const [full, keyword, variable, type] = match;
    if (keyword) target.appendChild(el("span", "tok-keyword", full));
    else if (variable) target.appendChild(el("span", "tok-var", full));
    else if (type) target.appendChild(el("span", "tok-type", full));
    lastIndex = match.index + full.length;
  }
  if (lastIndex < query.length) target.appendChild(text(query.slice(lastIndex)));

  if (variables && Object.keys(variables).length > 0) {
    target.appendChild(text("\n\n"));
    target.appendChild(el("span", "tok-comment", "# variables"));
    target.appendChild(text(`\n${JSON.stringify(variables, null, 2)}`));
  }
};

// ─── Init ────────────────────────────────────────────────────────────────
loadScenarios().catch((err) => {
  console.error("Failed to load scenarios:", err);
  dom.scenarioCount.textContent = "!";
  dom.status.textContent = "Failed to load scenarios.";
});
