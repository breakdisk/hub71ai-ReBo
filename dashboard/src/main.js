import "./style.css";

const API_BASE = (import.meta.env.VITE_API_URL || window.__ONBOARD_ENGINE_CONFIG__?.apiUrl || "http://localhost:8080").replace(/\/$/, "");
const STAGES = [
  { id: "identity", label: "Identity vault", short: "Identity", sub: "TOKEN SECURED", icon: "◇" },
  { id: "icp", label: "ICP staging", short: "ICP visa", sub: "GOVERNMENT", icon: "⌂" },
  { id: "banking", label: "Banking", short: "Banking", sub: "E-KYC", icon: "▤" },
  { id: "travel", label: "Travel", short: "Travel", sub: "FLIGHTS & STAY", icon: "✳" },
  { id: "logistics", label: "Logistics", short: "Logistics", sub: "MOVE-IN", icon: "▧" },
  { id: "complete", label: "Production live", short: "Live", sub: "ARRIVAL READY", icon: "✓" },
];
const state = {
  status: null,
  pipelines: [],
  exceptions: [],
  escalations: [],
  escalationFeedAvailable: false,
  mobility: null,
  homeReadiness: null,
  resilience: null,
  apiOnline: false,
  streamConnected: false,
  lastUpdated: null,
  filter: "",
  submitting: false,
  notice: "",
  noticeKind: "success",
};

const app = document.querySelector("#app");
const COMMUNITY_CONSENT_KEY = "onboard-engine.soft-landing-consent.v1";
app.innerHTML = `
  <div class="shell">
    <aside class="sidebar" aria-label="Main navigation">
      <a class="brand" href="#top" aria-label="Onboard Engine home">
        <span class="brand-mark"><span></span><span></span><span></span><span></span></span>
        <span><strong>onboard</strong><small>ENGINE</small></span>
      </a>
      <div class="workspace-label">WORKSPACE</div>
      <nav class="nav-list">
        <a class="nav-item active" href="#overview" aria-current="page"><span class="nav-icon">▦</span>Mission control</a>
        <a class="nav-item" href="#pipelines"><span class="nav-icon">⇢</span>Relocation pipelines</a>
        <a class="nav-item" href="#exceptions"><span class="nav-icon">◉</span>Exception inbox<span class="nav-count" id="nav-exception-count">0</span></a>
      </nav>
      <div class="sidebar-bottom">
        <div class="region-card">
          <div class="region-orb">AE</div>
          <div><strong>United Arab Emirates</strong><small>Abu Dhabi · Dubai</small></div>
          <span class="region-chevron">⌄</span>
        </div>
        <div class="sidebar-footer"><span class="avatar">OP</span><span><strong>Operations team</strong><small>Enterprise workspace</small></span><span class="dots">···</span></div>
      </div>
    </aside>

    <main class="main" id="top">
      <header class="topbar">
        <div class="breadcrumbs"><span>Workspace</span><span class="slash">/</span><strong>Mission control</strong></div>
        <div class="top-actions">
          <span class="env-pill"><span class="env-dot"></span><span id="environment-label">LOCAL DEMO</span></span>
          <button class="icon-button" id="refresh-button" type="button" aria-label="Refresh dashboard" title="Refresh dashboard">↻</button>
          <span class="avatar top-avatar" aria-label="Operations team">OP</span>
        </div>
      </header>

      <div class="content" id="overview">
        <section class="page-heading">
          <div>
            <div class="eyebrow"><span class="eyebrow-line"></span>GLOBAL MOBILITY OPERATIONS</div>
            <h1>Mission control<span class="heading-period">.</span></h1>
            <p class="page-intro">Every move, from offer accepted to arrival ready.</p>
          </div>
          <button class="primary-button" id="open-onboarding" type="button"><span>＋</span> Start an onboarding</button>
        </section>

        <section class="health-banner" id="health-banner" aria-live="polite">
          <div class="health-orbit"><span class="health-check">✓</span><span class="orbit-ring"></span></div>
          <div class="health-copy"><span class="health-kicker" id="health-kicker">SYSTEM HEALTH</span><h2 id="health-title">Silence is green.</h2><p id="health-description">All relocation handshakes are operating normally. We’ll surface anything that needs your attention.</p></div>
          <div class="health-meta"><span class="live-indicator"><i></i><span id="connection-label">CONNECTING</span></span><span class="health-updated" id="updated-label">Waiting for first sync</span></div>
          <div class="banner-decoration" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        </section>

        <section class="metrics-grid" aria-label="Relocation summary">
          <article class="metric-card"><div class="metric-label">ACTIVE PIPELINES<span class="metric-glyph">↗</span></div><div class="metric-number" id="active-count">—</div><div class="metric-foot"><span class="metric-dot green"></span><span>Across all relocation stages</span></div></article>
          <article class="metric-card"><div class="metric-label">NEEDS ATTENTION<span class="metric-glyph alert-glyph">!</span></div><div class="metric-number" id="exception-count">—</div><div class="metric-foot" id="exception-foot"><span class="metric-dot green"></span><span>No action required</span></div></article>
          <article class="metric-card providers-card"><div class="metric-label">CONNECTED PROVIDERS<span class="metric-glyph">⌁</span></div><div class="provider-list" id="providers-list"><span class="provider-pill"><i></i>ICP</span><span class="provider-pill"><i></i>Banking</span><span class="provider-pill"><i></i>Travel</span><span class="provider-pill"><i></i>Logistics</span></div><div class="metric-foot"><span class="metric-dot green"></span><span id="provider-foot">Partner handshakes monitored</span></div></article>
        </section>

        <section class="section-block pipeline-section" id="pipelines">
          <div class="section-heading"><div><div class="eyebrow section-eyebrow">LIVE OPERATIONS</div><h2>Relocation pipelines</h2><p>Follow every move through its journey to arrival.</p></div><div class="section-tools"><label class="search-box"><span aria-hidden="true">⌕</span><input id="pipeline-search" type="search" placeholder="Find a candidate" aria-label="Find a candidate" /></label><span class="live-tag"><i></i> LIVE</span></div></div>
          <div class="pipeline-board" id="pipeline-board" aria-label="Relocation pipeline swimlanes"></div>
        </section>

        <section class="section-block lower-grid" id="exceptions">
          <div class="inbox-panel panel">
            <div class="panel-heading"><div><div class="eyebrow section-eyebrow">EXCEPTION INBOX</div><h2>Only what needs you</h2></div><span class="inbox-badge" id="inbox-badge">0 OPEN</span></div>
            <div id="exception-list" class="exception-list"></div>
          </div>
          <div class="onboard-panel panel" id="onboarding">
            <div class="panel-heading"><div><div class="eyebrow section-eyebrow">NEW ARRIVAL</div><h2>Start a relocation</h2></div><span class="panel-icon">＋</span></div>
            <p class="panel-intro">Create a secure, end-to-end journey for your new hire.</p>
            <form id="onboarding-form" novalidate>
              <div class="form-row"><label>First name<input name="firstName" autocomplete="given-name" placeholder="e.g. Amira" required /></label><label>Last name<input name="lastName" autocomplete="family-name" placeholder="e.g. Hassan" required /></label></div>
              <label>Email address<input name="email" type="email" autocomplete="email" placeholder="amira@company.com" required /></label>
              <label>Identity token <span class="label-note">TOKENIZED · NEVER DISPLAYED AGAIN</span><input name="identityToken" type="password" autocomplete="off" placeholder="Paste secure identity vault token" required /></label>
              <div class="form-hint"><span>◈</span> Passport details stay in the candidate’s secure identity vault.</div>
              <div class="form-error" id="form-error" role="alert"></div>
              <button class="submit-button" id="submit-onboarding" type="submit">Create relocation <span>→</span></button>
            </form>
          </div>
        </section>

        <section class="section-block readiness-section" id="readiness" aria-labelledby="readiness-title">
          <div class="section-heading readiness-heading"><div><div class="eyebrow section-eyebrow">LOCAL PROTOTYPE · HUMAN REVIEW REQUIRED</div><h2 id="readiness-title">Safety &amp; readiness gates</h2><p>Demo records only. No external providers, legal determinations, utility activation, or failover are performed.</p></div><span class="prototype-stamp"><span></span> SYNTHETIC · UNCONFIGURED</span></div>
          <div class="readiness-grid">
            <article class="readiness-card community-card">
              <div class="readiness-card-top"><span class="readiness-icon community-icon">✳</span><span class="readiness-state neutral" id="community-state">NOT OPTED IN</span></div>
              <div class="readiness-kicker">CANDIDATE-LED · OPTIONAL</div>
              <h3>Soft landing &amp; community</h3>
              <p>Simulate a candidate choice to keep synthetic UAE welcome resources in this browser. This is not a real person’s consent.</p>
              <label class="readiness-check"><input id="community-consent" type="checkbox" /><span>I confirm this is a synthetic demo opt-in, not consent from an actual candidate.</span></label>
              <div class="readiness-actions"><button class="text-action" id="community-opt-in" type="button" disabled>Save demo opt-in</button><button class="text-action secondary-action" id="community-revoke" type="button" hidden>Clear demo choice</button></div>
              <div class="community-preview" id="community-preview" hidden>
                <span class="sample-label">SYNTHETIC EXAMPLES · NOT LOCATION-AWARE</span>
                <div class="resource-chips"><span>Newcomer circles</span><span>Family &amp; schools</span><span>Transit basics</span></div>
                <div class="culture-tip"><strong>Culture coach sample</strong><span>Ask colleagues about their preferred communication and meeting norms; preferences vary by person and workplace.</span></div>
                <div class="readiness-foot-inline">Family matchmaking and real-time local recommendations are not configured. This demo does not track location.</div>
              </div>
              <div class="readiness-error" id="community-error" role="status"></div>
              <div class="readiness-foot">Consent can be revoked here. The preference stays in browser storage and is never sent to the API.</div>
            </article>

            <article class="readiness-card tax-card">
              <div class="readiness-card-top"><span class="readiness-icon tax-icon">▤</span><span class="readiness-state warning" id="mobility-ruleset-state">RULESET NOT CONFIGURED</span></div>
              <div class="readiness-kicker">REPORTED DAYS · COMPENSATION EVENTS</div>
              <h3>Record synthetic mobility data</h3>
              <p>Human-confirmed demo entries only. The dashboard does not decide tax residence or calculate gratuity.</p>
              <form id="travel-day-form" class="readiness-form">
                <label>Reported travel event<input name="date" type="date" required /></label>
                <label>Event type<select name="kind" required><option value="arrival">Arrival in UAE</option><option value="departure">Departure from UAE</option><option value="in_country_day">Reported in-country day</option></select></label>
                <label class="readiness-check"><input name="consentAccepted" type="checkbox" required /><span>I consent to storing this synthetic travel entry in the local demo.</span></label>
                <label class="readiness-check"><input name="humanConfirmed" type="checkbox" required /><span>I confirm the reported event details are accurate for this demo.</span></label>
                <button class="text-action" type="submit">Record reported event</button>
              </form>
              <form id="salary-change-form" class="readiness-form">
                <div class="sample-label">SYNTHETIC PAYROLL EVENT ONLY</div>
                <label>Effective date<input name="effectiveDate" type="date" required /></label>
                <label>Basic salary<input name="basicSalary" type="number" min="0.01" step="0.01" required placeholder="Demo amount" /></label>
                <label>Currency<select name="currency"><option value="AED">AED</option></select></label>
                <label class="readiness-check"><input name="humanConfirmed" type="checkbox" required /><span>I confirm this is synthetic data approved for the local demo.</span></label>
                <button class="text-action" type="submit">Record compensation event</button>
              </form>
              <div class="readiness-error" id="mobility-error" role="status"></div>
              <div class="mobility-counts" id="mobility-counts"><span>Reported travel entries</span><strong>Not available</strong><span>Compensation events</span><strong>Not available</strong></div>
              <div class="mobility-record-list" id="mobility-record-list"></div>
              <div class="ledger-placeholder"><span>Tax position</span><strong>Not determined</strong><span>Gratuity result</span><strong>Not calculated</strong></div>
              <div class="readiness-foot">Ruleset state is shown for configuration only. No residency conclusion or gratuity amount is produced.</div>
            </article>

            <article class="readiness-card escalation-card">
              <div class="readiness-card-top"><span class="readiness-icon escalation-icon">⌁</span><span class="readiness-state warning" id="escalation-state">NO ASSIGNMENTS</span></div>
              <div class="readiness-kicker">SPECIALIST ESCALATION</div>
              <h3>Human war-room routing</h3>
              <p>Review records go to the local demo API. No message is sent and no case is assigned to a specialist or government contact.</p>
              <div class="assignment-list"><div><span>Mobility specialist</span><strong>Unassigned</strong></div><div><span>Tax counsel</span><strong>Unassigned</strong></div><div><span>Housing coordinator</span><strong>Unassigned</strong></div></div>
              <div class="escalation-feed" id="escalation-feed" aria-live="polite"></div>
              <div class="readiness-error" id="escalation-error" role="status"></div>
              <button class="disabled-action" type="button" disabled title="Assignments and direct channels are not configured">Assignments and liaison channels unconfigured</button>
              <div class="readiness-foot">No on-call coverage or response-time commitment is configured.</div>
            </article>

            <article class="readiness-card handover-card">
              <div class="readiness-card-top"><span class="readiness-icon handover-icon">⌂</span><span class="readiness-state warning" id="home-readiness-state">HANDOVER BLOCKED</span></div>
              <div class="readiness-kicker">HOME &amp; UTILITY HANDOVER</div>
              <h3>Two required human gates</h3>
              <p>Record a lease reference and separate human checks. This does not activate DEWA, Empower, telecom, or smart-home services.</p>
              <form id="home-readiness-form" class="readiness-form">
                <label>Lease proof reference<input name="leaseReference" autocomplete="off" maxlength="100" placeholder="Synthetic reference only" required /></label>
                <label class="readiness-check"><input name="leaseProofReviewed" type="checkbox" required /><span>I reviewed the referenced lease evidence.</span></label>
                <label class="readiness-check"><input name="humanApproved" type="checkbox" required /><span>I approve recording this home-readiness review only.</span></label>
                <button class="text-action" type="submit">Record both human gates</button>
              </form>
              <div class="gate-list" id="home-gate-status"><div class="gate-row"><span class="gate-number">01</span><span class="gate-name">Lease proof</span><span class="gate-status">Required · not reviewed</span></div><div class="gate-row"><span class="gate-number">02</span><span class="gate-name">Human approval</span><span class="gate-status">Required · pending</span></div><div class="gate-row"><span class="gate-number">03</span><span class="gate-name">Utilities / IoT</span><span class="gate-status">Unconfigured · blocked</span></div></div>
              <div class="readiness-error" id="home-readiness-error" role="status"></div>
              <div class="readiness-foot">Recording both gates never creates an activation request; utility and IoT connections remain unconfigured.</div>
            </article>

            <article class="readiness-card dr-card">
              <div class="readiness-card-top"><span class="readiness-icon dr-icon">⌘</span><span class="readiness-state unknown">READINESS UNKNOWN</span></div>
              <div class="readiness-kicker">MULTI-REGION RESILIENCE</div>
              <h3>Configuration unverified</h3>
              <p>Record a local tabletop review note. It does not inspect infrastructure or run a failover.</p>
              <div class="dr-grid" id="resilience-facts"><span>Region inventory</span><strong>Not configured</strong><span>RPO target</span><strong>Unknown</strong><span>RTO target</span><strong>Unknown</strong></div>
              <form id="resilience-review-form" class="readiness-form">
                <label>Tabletop outcome<select name="outcome" required><option value="gaps_identified">Gaps identified</option><option value="no_known_gaps">No known gaps in this tabletop</option></select></label>
                <label class="readiness-check"><input name="humanConfirmed" type="checkbox" required /><span>I confirm this was a tabletop review only; no failover was run.</span></label>
                <button class="text-action" type="submit">Record tabletop note</button>
              </form>
              <div class="readiness-error" id="resilience-error" role="status"></div>
              <div class="resilience-review-status" id="resilience-review-status">No tabletop review note recorded.</div>
              <div class="unknown-note"><span>!</span> No recovery-readiness claim can be made.</div>
              <div class="readiness-foot">A recorded note never changes posture from unknown or triggers traffic / infrastructure changes.</div>
            </article>
          </div>
        </section>
        <footer class="page-footer"><span>ONBOARD ENGINE <span class="footer-sep">/</span> MISSION CONTROL</span><span>Designed for the journey ahead <span class="footer-spark">✳</span></span></footer>
      </div>
    </main>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function initials(candidate = {}) {
  return `${candidate.firstName?.[0] || "?"}${candidate.lastName?.[0] || ""}`.toUpperCase();
}

function fullName(candidate = {}) {
  return [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") || "New candidate";
}

function prettyStage(stage) {
  return STAGES.find((item) => item.id === String(stage || "").toLowerCase())?.label || String(stage || "Processing").replaceAll("_", " ");
}

function pendingEscalations() {
  return state.escalations.filter((item) => item.status !== "resolved");
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function localCommunityConsent() {
  try { return window.localStorage.getItem(COMMUNITY_CONSENT_KEY) === "true"; }
  catch { return false; }
}

function renderCommunity() {
  const enabled = localCommunityConsent();
  document.querySelector("#community-consent").checked = false;
  document.querySelector("#community-opt-in").disabled = true;
  document.querySelector("#community-preview").hidden = !enabled;
  document.querySelector("#community-revoke").hidden = !enabled;
  document.querySelector("#community-state").textContent = enabled ? "DEMO OPT-IN · LOCAL" : "NOT OPTED IN";
  document.querySelector("#community-state").className = `readiness-state ${enabled ? "neutral" : "warning"}`;
}

function renderMobility() {
  const mobility = state.mobility;
  const status = document.querySelector("#mobility-ruleset-state");
  const counts = document.querySelector("#mobility-counts");
  const list = document.querySelector("#mobility-record-list");
  const error = document.querySelector("#mobility-error");
  if (!mobility) {
    status.textContent = "API UNCONFIGURED";
    status.className = "readiness-state warning";
    counts.innerHTML = "<span>Reported travel entries</span><strong>Unavailable</strong><span>Compensation events</span><strong>Unavailable</strong>";
    list.innerHTML = "";
    if (!error.textContent) error.textContent = "Local mobility endpoints are unavailable; no records can be saved.";
    document.querySelectorAll("#travel-day-form button, #salary-change-form button").forEach((button) => { button.disabled = true; });
    return;
  }
  status.textContent = mobility.ruleset?.configured ? "RULESET · OUTPUT DISABLED" : "RULESET NOT CONFIGURED";
  status.className = "readiness-state warning";
  error.textContent = "";
  document.querySelectorAll("#travel-day-form button, #salary-change-form button").forEach((button) => { button.disabled = false; });
  const travelDays = Array.isArray(mobility.travelDays) ? mobility.travelDays : [];
  const salaryChanges = Array.isArray(mobility.salaryChanges) ? mobility.salaryChanges : [];
  counts.innerHTML = `<span>Reported travel entries</span><strong>${travelDays.length}</strong><span>Compensation events</span><strong>${salaryChanges.length}</strong>`;
  const travelRows = travelDays.slice(-3).reverse().map((item) => `<div><span>Travel · ${escapeHtml(item.kind || "reported event")}</span><time>${escapeHtml(item.date || "Date not supplied")}</time></div>`);
  const salaryRows = salaryChanges.slice(-2).reverse().map((item) => `<div><span>Compensation event · amount suppressed</span><time>${escapeHtml(item.effectiveDate || "Date not supplied")}</time></div>`);
  list.innerHTML = [...travelRows, ...salaryRows].join("") || `<div class="mobility-empty">No synthetic records have been entered.</div>`;
}

function renderHomeReadiness() {
  const home = state.homeReadiness;
  const badge = document.querySelector("#home-readiness-state");
  const gates = document.querySelector("#home-gate-status");
  const error = document.querySelector("#home-readiness-error");
  if (!home) {
    badge.textContent = "API UNCONFIGURED · BLOCKED";
    badge.className = "readiness-state warning";
    gates.innerHTML = `<div class="gate-row"><span class="gate-number">01</span><span class="gate-name">Lease proof</span><span class="gate-status">Unknown · API unavailable</span></div><div class="gate-row"><span class="gate-number">02</span><span class="gate-name">Human approval</span><span class="gate-status">Unknown · API unavailable</span></div><div class="gate-row"><span class="gate-number">03</span><span class="gate-name">Utilities / IoT</span><span class="gate-status">Unconfigured · blocked</span></div>`;
    if (!error.textContent) error.textContent = "Local home-readiness endpoint unavailable; no gate was recorded.";
    document.querySelector("#home-readiness-form button").disabled = true;
    return;
  }
  const proof = Boolean(home.leaseProofReviewed && home.leaseReference);
  const approved = Boolean(home.humanApproved);
  badge.textContent = proof && approved ? "GATES RECORDED · SERVICES BLOCKED" : "HANDOVER BLOCKED";
  badge.className = "readiness-state warning";
  error.textContent = "";
  document.querySelector("#home-readiness-form button").disabled = false;
  gates.innerHTML = `<div class="gate-row"><span class="gate-number">01</span><span class="gate-name">Lease proof</span><span class="gate-status">${proof ? "Review recorded" : "Required · not reviewed"}</span></div><div class="gate-row"><span class="gate-number">02</span><span class="gate-name">Human approval</span><span class="gate-status">${approved ? "Approval recorded" : "Required · pending"}</span></div><div class="gate-row"><span class="gate-number">03</span><span class="gate-name">Utilities / IoT</span><span class="gate-status">${escapeHtml(home.utilities?.status || "blocked")} · ${escapeHtml(home.utilities?.providerStatus || "unconfigured")}</span></div>`;
}

function renderResilience() {
  const resilience = state.resilience;
  const facts = document.querySelector("#resilience-facts");
  const reviewStatus = document.querySelector("#resilience-review-status");
  const error = document.querySelector("#resilience-error");
  if (!resilience) {
    facts.innerHTML = "<span>Region inventory</span><strong>Not configured</strong><span>RPO target</span><strong>Unknown</strong><span>RTO target</span><strong>Unknown</strong>";
    reviewStatus.textContent = "Local resilience endpoint unavailable; posture stays unknown.";
    if (!error.textContent) error.textContent = "Local resilience endpoint unavailable; no review was recorded.";
    document.querySelector("#resilience-review-form button").disabled = true;
    return;
  }
  error.textContent = "";
  document.querySelector("#resilience-review-form button").disabled = false;
  facts.innerHTML = `<span>Region inventory</span><strong>${resilience.failoverConfigured ? "Configured · untested" : "Not configured"}</strong><span>RPO target</span><strong>${resilience.rpoMinutes == null ? "Unknown" : `${escapeHtml(resilience.rpoMinutes)} min · unverified`}</strong><span>RTO target</span><strong>${resilience.rtoMinutes == null ? "Unknown" : `${escapeHtml(resilience.rtoMinutes)} min · unverified`}</strong>`;
  const reviews = Array.isArray(resilience.reviews) ? resilience.reviews : [];
  const latest = reviews.at(-1);
  reviewStatus.textContent = latest ? `Tabletop note recorded ${escapeHtml(latest.reviewedAt || "")} · ${escapeHtml(latest.outcome || "outcome not supplied")} · no failover run.` : "No tabletop review note recorded.";
}

function setHealth(isOnline, details = {}) {
  state.apiOnline = isOnline;
  if (details.status) state.status = details;
  const banner = document.querySelector("#health-banner");
  const pendingCount = pendingEscalations().length;
  const attentionCount = state.exceptions.length + pendingCount;
  const healthy = isOnline && attentionCount === 0;
  banner.classList.toggle("attention", isOnline && attentionCount > 0);
  banner.classList.toggle("offline", !isOnline);
  document.querySelector("#health-kicker").textContent = !isOnline ? "API CONNECTION" : healthy ? "SYSTEM HEALTH" : "ACTION REQUIRED";
  document.querySelector("#health-title").textContent = !isOnline ? "Reconnecting to mission control." : healthy ? "Silence is green." : pendingCount && !state.exceptions.length ? `${pendingCount} human ${pendingCount === 1 ? "escalation needs" : "escalations need"} attention.` : `${attentionCount} ${attentionCount === 1 ? "item" : "items"} need attention.`;
  document.querySelector("#health-description").textContent = !isOnline
    ? `The API at ${API_BASE} is unavailable. The dashboard will retry automatically.`
    : healthy
      ? "All relocation handshakes are operating normally. We’ll surface anything that needs your attention."
      : pendingCount ? "A relocation is waiting on a human decision. Review the exception inbox and specialist war-room queue below." : "A relocation needs a human decision. Review the exception inbox below to see what happened.";
  document.querySelector("#connection-label").textContent = !isOnline ? "OFFLINE · RETRYING" : state.streamConnected ? "LIVE STREAM" : "SYNCED · POLLING";
  document.querySelector(".live-indicator").classList.toggle("disconnected", !isOnline);
  document.querySelector("#environment-label").textContent = details.environment || state.status?.environment || "LOCAL DEMO";
}

function renderMetrics() {
  document.querySelector("#active-count").textContent = state.pipelines.length.toLocaleString();
  const attentionCount = state.exceptions.length + pendingEscalations().length;
  document.querySelector("#exception-count").textContent = attentionCount.toLocaleString();
  document.querySelector("#nav-exception-count").textContent = state.exceptions.length;
  document.querySelector("#inbox-badge").textContent = `${state.exceptions.length} OPEN`;
  document.querySelector("#exception-foot").innerHTML = attentionCount
    ? `<span class="metric-dot red"></span><span>${attentionCount === 1 ? "One exception or escalation needs review" : `${attentionCount} exceptions or escalations need review`}</span>`
    : `<span class="metric-dot green"></span><span>No action required</span>`;
  const providers = Array.isArray(state.status?.providers) ? state.status.providers : null;
  if (providers) {
    document.querySelector("#providers-list").innerHTML = providers.map((provider) => `<span class="provider-pill"><i></i>${escapeHtml(provider.name || provider)}</span>`).join("");
  } else if (state.status?.providers) {
    document.querySelector("#provider-foot").textContent = `${state.status.providers} provider connections monitored`;
  }
  document.querySelector("#updated-label").textContent = state.lastUpdated ? `Updated ${state.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for first sync";
  setHealth(state.apiOnline);
}

function pipelineStateAt(pipeline, stageIndex) {
  const current = STAGES.findIndex((stage) => stage.id === String(pipeline.stage || "identity").toLowerCase());
  if (pipeline.state === "failed") return stageIndex === Math.max(0, current) ? "failed" : stageIndex < current ? "completed" : "waiting";
  if (pipeline.state === "completed" || current === STAGES.length - 1) return "completed";
  return stageIndex < current ? "completed" : stageIndex === current ? "in_progress" : "waiting";
}

function renderPipelineCard(pipeline, stageIndex) {
  const status = pipelineStateAt(pipeline, stageIndex);
  const date = pipeline.updatedAt || pipeline.createdAt;
  const isCurrent = status === "in_progress" || status === "failed";
  return `<article class="candidate-card ${status}${isCurrent ? " current-card" : ""}" title="${escapeHtml(fullName(pipeline.candidate))} · ${escapeHtml(prettyStage(pipeline.stage))} · ${escapeHtml(pipeline.state)}">
    <div class="candidate-head"><span class="candidate-avatar ${status === "failed" ? "avatar-failed" : ""}">${escapeHtml(initials(pipeline.candidate))}</span><span class="candidate-status ${status}">${status === "failed" ? "Needs attention" : status === "completed" ? "Done" : status === "waiting" ? "Queued" : "In progress"}</span></div>
    <strong class="candidate-name">${escapeHtml(fullName(pipeline.candidate))}</strong>
    <span class="candidate-email">${escapeHtml(pipeline.candidate?.email || "")}</span>
    <div class="candidate-foot"><span>${isCurrent ? escapeHtml(prettyStage(pipeline.stage)) : status === "completed" ? "Completed" : "Awaiting"}</span><time>${date ? new Date(date).toLocaleDateString([], { month: "short", day: "numeric" }) : "New"}</time></div>
  </article>`;
}

function renderPipelines() {
  const board = document.querySelector("#pipeline-board");
  const query = state.filter.trim().toLowerCase();
  const items = state.pipelines.filter((pipeline) => `${fullName(pipeline.candidate)} ${pipeline.candidate?.email || ""}`.toLowerCase().includes(query));
  board.innerHTML = STAGES.map((stage, index) => {
    const cards = items.map((pipeline) => renderPipelineCard(pipeline, index)).join("");
    const activeCount = items.filter((pipeline) => ["in_progress", "failed"].includes(pipelineStateAt(pipeline, index))).length;
    return `<section class="lane" aria-label="${escapeHtml(stage.label)} lane"><header class="lane-heading"><div class="lane-title-row"><span class="lane-icon ${stage.id}">${stage.icon}</span><span class="lane-title">${escapeHtml(stage.short)}</span><span class="lane-count">${activeCount}</span></div><span class="lane-subtitle">${stage.sub}</span></header><div class="lane-track ${stage.id}">${cards || `<div class="lane-empty">${items.length ? "No candidates in this lane" : query ? "No matching candidate" : "No journeys yet"}</div>`}</div></section>`;
  }).join("");
  document.querySelector("#connection-label").textContent = state.apiOnline ? state.streamConnected ? "LIVE STREAM" : "SYNCED · POLLING" : "OFFLINE · RETRYING";
}

function renderExceptions() {
  const list = document.querySelector("#exception-list");
  if (!state.exceptions.length) {
    const pendingCount = pendingEscalations().length;
    list.innerHTML = pendingCount
      ? `<div class="all-clear"><span class="clear-check">✓</span><div><strong>No API exceptions</strong><p>${pendingCount} human ${pendingCount === 1 ? "escalation is" : "escalations are"} listed in the war-room queue.</p></div><span class="clear-glint">✳</span></div>`
      : `<div class="all-clear"><span class="clear-check">✓</span><div><strong>All clear</strong><p>Any issue that needs a person will show up here.</p></div><span class="clear-glint">✳</span></div>`;
    return;
  }
  list.innerHTML = state.exceptions.slice(0, 5).map((item) => {
    const date = item.occurredAt ? new Date(item.occurredAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Just now";
    const pipeline = state.pipelines.find((p) => p.pipelineId === item.pipelineId);
    return `<article class="exception-item"><span class="exception-icon">!</span><div class="exception-body"><div class="exception-title-row"><strong>${escapeHtml(pipeline ? fullName(pipeline.candidate) : "Relocation exception")}</strong><span class="exception-time">${escapeHtml(date)}</span></div><p>${escapeHtml(item.message || item.code || "A workflow step needs attention.")}</p><div class="exception-meta"><span>${escapeHtml(prettyStage(item.stage))}</span>${item.code ? `<span class="exception-code">${escapeHtml(item.code)}</span>` : ""}</div></div></article>`;
  }).join("");
}

function renderEscalations() {
  const feed = document.querySelector("#escalation-feed");
  const stateBadge = document.querySelector("#escalation-state");
  const error = document.querySelector("#escalation-error");
  const pending = pendingEscalations();
  error.textContent = "";
  if (pending.length) stateBadge.textContent = `${pending.length} OPEN CASE${pending.length === 1 ? "" : "S"}`;
  else stateBadge.textContent = state.escalationFeedAvailable ? "NO OPEN CASES" : "API UNCONFIGURED";
  stateBadge.className = `readiness-state ${pending.length || !state.escalationFeedAvailable ? "warning" : "neutral"}`;
  if (!state.escalationFeedAvailable) {
    feed.innerHTML = `<div class="escalation-feed-empty">Local escalation API unavailable. No case was acknowledged, assigned, or sent.</div>`;
    return;
  }
  if (!pending.length) {
    feed.innerHTML = `<div class="escalation-feed-empty">No open local demo cases. Specialist assignments and response targets remain unconfigured.</div>`;
    return;
  }
  feed.innerHTML = pending.slice(0, 10).map((item) => {
    const pipeline = state.pipelines.find((candidate) => candidate.pipelineId === item.pipelineId);
    const name = pipeline ? fullName(pipeline.candidate) : "Relocation case";
    const created = item.createdAt ? new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Awaiting review";
    const id = escapeHtml(item.id || "");
    const isAcknowledged = item.status === "acknowledged";
    const actionForm = isAcknowledged
      ? `<form class="escalation-action-form" data-escalation-id="${id}" data-action="resolve"><label>Resolution outcome<select name="resolutionCode" required><option value="evidence_corrected">Evidence corrected</option><option value="provider_recovered">Provider recovered</option><option value="approved_manual_resolution">Approved manual resolution</option><option value="false_positive">False positive</option></select></label><label class="review-check"><input name="humanConfirmed" type="checkbox" required /><span>I confirm the selected outcome is supported by human review.</span></label><button class="text-action" type="submit">Record resolution</button></form>`
      : `<form class="escalation-action-form" data-escalation-id="${id}" data-action="acknowledge"><label class="review-check"><input name="humanConfirmed" type="checkbox" required /><span>I reviewed this case and confirm a person must own the next step.</span></label><button class="text-action" type="submit">Record human review</button></form>`;
    return `<article class="escalation-feed-item"><div class="escalation-feed-top"><strong>${escapeHtml(name)}</strong><span class="severity-tag">${escapeHtml(String(item.severity || "review").toUpperCase())}</span></div><div class="escalation-feed-meta"><span>${escapeHtml(prettyStage(item.stage))}</span><span>${escapeHtml(item.owningTeam || "Team unassigned")}</span><time>${escapeHtml(created)}</time></div><p><b>Next:</b> ${escapeHtml(item.requiredNextAction || "Human review required")}</p><p class="case-state-note">${isAcknowledged ? "Acknowledged locally · still needs a human outcome." : "Pending human review · no one has been assigned."}</p>${actionForm}</article>`;
  }).join("");
}

function render() {
  renderMetrics();
  renderPipelines();
  renderExceptions();
  renderEscalations();
  renderMobility();
  renderHomeReadiness();
  renderResilience();
}

async function syncDashboard() {
  try {
    const [health, status, pipelines, exceptions, escalations, mobility, homeReadiness, resilience] = await Promise.all([
      request("/health"), request("/api/status"), request("/api/pipelines"), request("/api/exceptions"), request("/api/escalations").catch(() => null),
      request("/api/mobility").catch(() => null), request("/api/home-readiness").catch(() => null), request("/api/resilience").catch(() => null),
    ]);
    state.status = status || health;
    state.pipelines = Array.isArray(pipelines?.items) ? pipelines.items : [];
    state.exceptions = Array.isArray(exceptions?.items) ? exceptions.items : [];
    state.escalationFeedAvailable = Array.isArray(escalations?.items);
    state.escalations = state.escalationFeedAvailable ? escalations.items : [];
    state.mobility = mobility?.ruleset ? mobility : null;
    state.homeReadiness = homeReadiness && typeof homeReadiness.leaseProofReviewed === "boolean" ? homeReadiness : null;
    state.resilience = resilience && Array.isArray(resilience.reviews) ? resilience : null;
    state.lastUpdated = new Date();
    state.apiOnline = true;
    render();
  } catch (error) {
    state.apiOnline = false;
    render();
  }
}

function connectEvents() {
  if (!("EventSource" in window)) return;
  let stream;
  try { stream = new EventSource(`${API_BASE}/api/events`); } catch { return; }
  stream.addEventListener("open", () => {
    state.streamConnected = true;
    document.querySelector("#connection-label").textContent = "LIVE STREAM";
  });
  stream.addEventListener("pipeline.updated", (event) => {
    try {
      const pipeline = JSON.parse(event.data);
      const index = state.pipelines.findIndex((item) => item.pipelineId === pipeline.pipelineId);
      if (index < 0) state.pipelines.unshift(pipeline); else state.pipelines[index] = pipeline;
      state.lastUpdated = new Date(); render();
    } catch { syncDashboard(); }
  });
  stream.addEventListener("exception.created", (event) => {
    try {
      const exception = JSON.parse(event.data);
      if (!state.exceptions.some((item) => item.id === exception.id)) state.exceptions.unshift(exception);
      state.lastUpdated = new Date(); render();
    } catch { syncDashboard(); }
  });
  stream.addEventListener("escalation.created", (event) => {
    try {
      const escalation = JSON.parse(event.data);
      const index = state.escalations.findIndex((item) => item.id === escalation.id);
      if (index < 0) state.escalations.unshift(escalation); else state.escalations[index] = escalation;
      state.escalationFeedAvailable = true;
      state.lastUpdated = new Date();
      render();
    } catch { syncDashboard(); }
  });
  stream.addEventListener("escalation.updated", (event) => {
    try {
      const escalation = JSON.parse(event.data);
      const index = state.escalations.findIndex((item) => item.id === escalation.id);
      if (index < 0) state.escalations.unshift(escalation); else state.escalations[index] = escalation;
      state.escalationFeedAvailable = true;
      state.lastUpdated = new Date();
      render();
    } catch { syncDashboard(); }
  });
  for (const eventName of [
    "mobility.travel_day.recorded",
    "mobility.salary_change.recorded",
    "home_readiness.gate.recorded",
    "resilience.tabletop_review.recorded",
  ]) {
    stream.addEventListener(eventName, () => {
      state.lastUpdated = new Date();
      syncDashboard();
    });
  }
  stream.onerror = () => {
    state.streamConnected = false;
    document.querySelector("#connection-label").textContent = state.apiOnline ? "SYNCED · POLLING" : "OFFLINE · RETRYING";
  };
}

function toast(message, kind = "success") {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.className = `toast show ${kind}`;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { element.classList.remove("show"); }, 4200);
}

document.querySelector("#refresh-button").addEventListener("click", async (event) => {
  event.currentTarget.classList.add("spinning");
  await syncDashboard();
  event.currentTarget.classList.remove("spinning");
});

document.querySelector("#pipeline-search").addEventListener("input", (event) => {
  state.filter = event.currentTarget.value;
  renderPipelines();
});

document.querySelector("#open-onboarding").addEventListener("click", () => {
  document.querySelector("#onboarding").scrollIntoView({ behavior: "smooth", block: "center" });
  document.querySelector("#onboarding-form [name=firstName]").focus({ preventScroll: true });
});

document.querySelector("#community-consent").addEventListener("change", (event) => {
  document.querySelector("#community-opt-in").disabled = !event.currentTarget.checked;
  document.querySelector("#community-error").textContent = "";
});

document.querySelector("#community-opt-in").addEventListener("click", () => {
  const checkbox = document.querySelector("#community-consent");
  const error = document.querySelector("#community-error");
  if (!checkbox.checked) return;
  try {
    window.localStorage.setItem(COMMUNITY_CONSENT_KEY, "true");
    renderCommunity();
    toast("Synthetic demo opt-in saved in this browser only.");
  } catch {
    error.textContent = "Browser storage is unavailable; no preference was saved.";
  }
});

document.querySelector("#community-revoke").addEventListener("click", () => {
  const error = document.querySelector("#community-error");
  try {
    window.localStorage.removeItem(COMMUNITY_CONSENT_KEY);
    renderCommunity();
    toast("Synthetic demo choice cleared from this browser.");
  } catch {
    error.textContent = "Browser storage is unavailable; the saved preference could not be removed.";
  }
});

function todayLocalISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function wireReadinessForm(selector, errorSelector, handler, successMessage, canSubmit) {
  document.querySelector(selector).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector(errorSelector);
    const button = form.querySelector("button[type=submit]");
    if (!form.reportValidity() || button.disabled) return;
    const buttonLabel = button.textContent;
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Saving local record…";
    try {
      await handler(Object.fromEntries(new FormData(form).entries()));
      form.reset();
      await syncDashboard();
      toast(successMessage);
    } catch (submitError) {
      error.textContent = `Could not save the local demo record. ${submitError.message}`;
    } finally {
      button.textContent = buttonLabel;
      button.disabled = !canSubmit();
    }
  });
}

wireReadinessForm("#travel-day-form", "#mobility-error", async (data) => {
  await request("/api/mobility/travel-days", {
    method: "POST",
    body: JSON.stringify({ date: data.date, country: "AE", kind: data.kind, humanConfirmed: true, consentAccepted: true }),
  });
}, "Synthetic travel event recorded; no day count or tax status was inferred.", () => Boolean(state.mobility));

wireReadinessForm("#salary-change-form", "#mobility-error", async (data) => {
  await request("/api/mobility/salary-changes", {
    method: "POST",
    body: JSON.stringify({ effectiveDate: data.effectiveDate, basicSalary: Number(data.basicSalary), currency: data.currency, humanConfirmed: true }),
  });
}, "Synthetic compensation event recorded; gratuity remains uncalculated.", () => Boolean(state.mobility));

wireReadinessForm("#home-readiness-form", "#home-readiness-error", async (data) => {
  await request("/api/home-readiness", {
    method: "POST",
    body: JSON.stringify({ leaseReference: data.leaseReference.trim(), leaseProofReviewed: true, humanApproved: true }),
  });
}, "Human gates recorded; utility and smart-home services remain blocked.", () => Boolean(state.homeReadiness));

wireReadinessForm("#resilience-review-form", "#resilience-error", async (data) => {
  await request("/api/resilience/reviews", {
    method: "POST",
    body: JSON.stringify({ humanConfirmed: true, reviewedAt: todayLocalISO(), outcome: data.outcome }),
  });
}, "Tabletop note recorded; no failover was run and readiness remains unknown.", () => Boolean(state.resilience));

document.querySelector("#escalation-feed").addEventListener("submit", async (event) => {
  const form = event.target.closest(".escalation-action-form");
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector("button[type=submit]");
  const error = document.querySelector("#escalation-error");
  const action = form.dataset.action;
  const payload = { humanConfirmed: true, action };
  if (action === "resolve") payload.resolutionCode = new FormData(form).get("resolutionCode");
  button.disabled = true;
  button.textContent = "Saving review…";
  error.textContent = "";
  try {
    await request(`/api/escalations/${encodeURIComponent(form.dataset.escalationId)}`, { method: "PATCH", body: JSON.stringify(payload) });
    await syncDashboard();
    toast(action === "resolve" ? "Local case resolution recorded." : "Human acknowledgement recorded; the case remains open for an outcome.");
  } catch (submitError) {
    error.textContent = `Could not save the escalation review. ${submitError.message}`;
    button.disabled = false;
    button.textContent = action === "resolve" ? "Record resolution" : "Record human review";
  }
});

document.querySelector("#onboarding-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = document.querySelector("#form-error");
  errorBox.textContent = "";
  const data = Object.fromEntries(new FormData(form).entries());
  if (!form.reportValidity()) return;
  const button = document.querySelector("#submit-onboarding");
  button.disabled = true;
  button.innerHTML = `<span class="button-spinner"></span> Creating secure journey…`;
  try {
    const result = await request("/api/onboarding", { method: "POST", body: JSON.stringify(data) });
    form.reset();
    await syncDashboard();
    const name = fullName(result?.candidate || data);
    toast(`${name}’s relocation journey is underway.`);
    if (result?.state === "failed") toast(`${name} needs attention in ${prettyStage(result.stage)}. Check the exception inbox.`, "alert");
    document.querySelector("#pipelines").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    errorBox.textContent = state.apiOnline ? `Could not create the relocation. ${error.message}` : `The API is offline. Your form hasn’t been sent; try again when the connection returns.`;
  } finally {
    button.disabled = false;
    button.innerHTML = `Create relocation <span>→</span>`;
  }
});

renderCommunity();
syncDashboard();
connectEvents();
window.setInterval(syncDashboard, 15_000);
