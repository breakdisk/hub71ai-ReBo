import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const host = "127.0.0.1";
const port = Number(process.env.MOCK_API_PORT || 8080);
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173"]);
const pipelines = new Map();
const exceptions = [];
const escalations = [];
const idempotency = new Map();
const eventClients = new Set();
const mobility = { ruleset: { configured: false, approved: false, version: null }, travelDays: [], salaryChanges: [] };
const homeReadiness = {
  leaseReference: null,
  leaseProofReviewed: false,
  humanApproved: false,
  utilities: { status: "blocked", providerStatus: "unconfigured", reason: "No local utility or smart-home provider adapter is configured." },
};
const resilience = { status: "unknown", rpoMinutes: null, rtoMinutes: null, failoverConfigured: false, reviews: [] };
const audit = [];
const resolutionCodes = new Set(["evidence_corrected", "provider_recovered", "approved_manual_resolution", "false_positive"]);

function json(response, status, value, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  response.end(JSON.stringify(value));
}

function emit(name, value) {
  const payload = `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
  for (const client of eventClients) client.write(payload);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    response.writeHead(403).end();
    return;
  }
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  const path = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  if (request.method === "GET" && path === "/health") return json(response, 200, { status: "ok" }, origin);
  if (request.method === "GET" && path === "/api/status") {
    return json(response, 200, {
      status: "healthy", environment: "local-demo", pipelineCount: pipelines.size,
      exceptionCount: exceptions.length, providers: "mock",
    }, origin);
  }
  if (request.method === "GET" && path === "/api/pipelines") {
    return json(response, 200, { items: [...pipelines.values()] }, origin);
  }
  if (request.method === "GET" && path === "/api/exceptions") {
    return json(response, 200, { items: exceptions }, origin);
  }
  if (request.method === "GET" && path === "/api/escalations") {
    return json(response, 200, { items: escalations }, origin);
  }
  if (request.method === "GET" && path === "/api/audit") return json(response, 200, { items: audit }, origin);
  if (request.method === "GET" && path === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    });
    response.write(": mock event stream ready\n\n");
    eventClients.add(response);
    request.on("close", () => eventClients.delete(response));
    return;
  }
  if (request.method === "GET" && path === "/api/mobility") {
    return json(response, 200, mobility, origin);
  }
  if (request.method === "POST" && path === "/api/mobility/travel-days") {
    try {
      const body = await readJson(request);
      const date = String(body.date || "");
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && date <= new Date().toISOString().slice(0, 10);
      if (!validDate || body.country !== "AE" || !["arrival", "departure", "in_country_day"].includes(body.kind) || body.humanConfirmed !== true || body.consentAccepted !== true) {
        return json(response, 400, { error: { code: "INVALID_TRAVEL_EVIDENCE", message: "A past or current UAE travel event requires explicit demo consent and human confirmation." } }, origin);
      }
      const previous = mobility.travelDays.find((item) => item.date === date && item.country === body.country && item.kind === body.kind);
      if (previous) return json(response, 200, previous, origin);
      const record = { id: randomUUID(), date, country: "AE", kind: body.kind, humanConfirmed: true };
      mobility.travelDays.push(record);
      emit("mobility.travel_day.recorded", { id: record.id });
      return json(response, 201, record, origin);
    } catch (error) {
      const status = error.status || 400;
      return json(response, status, { error: { code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST", message: "Travel evidence could not be recorded." } }, origin);
    }
  }
  if (request.method === "POST" && path === "/api/mobility/salary-changes") {
    try {
      const body = await readJson(request);
      const effectiveDate = String(body.effectiveDate || "");
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && !Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`));
      const basicSalary = Number(body.basicSalary);
      if (!validDate || !Number.isFinite(basicSalary) || basicSalary <= 0 || body.currency !== "AED" || body.humanConfirmed !== true) {
        return json(response, 400, { error: { code: "INVALID_COMPENSATION_EVIDENCE", message: "A synthetic AED compensation event requires a valid date, positive amount, and human confirmation." } }, origin);
      }
      const previous = mobility.salaryChanges.find((item) => item.effectiveDate === effectiveDate);
      if (previous) {
        if (previous.basicSalary !== basicSalary || previous.currency !== body.currency) {
          return json(response, 409, { error: { code: "SALARY_DATE_CONFLICT", message: "A different salary event already exists for this effective date." } }, origin);
        }
        return json(response, 200, previous, origin);
      }
      const record = { id: randomUUID(), effectiveDate, basicSalary, currency: "AED", humanConfirmed: true };
      mobility.salaryChanges.push(record);
      emit("mobility.salary_change.recorded", { id: record.id });
      return json(response, 201, record, origin);
    } catch (error) {
      const status = error.status || 400;
      return json(response, status, { error: { code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST", message: "Compensation evidence could not be recorded." } }, origin);
    }
  }
  if (request.method === "PATCH" && path.startsWith("/api/escalations/")) {
    const id = path.slice("/api/escalations/".length);
    const item = escalations.find((candidate) => candidate.id === id);
    if (!item) return json(response, 404, { error: { code: "ESCALATION_NOT_FOUND", message: "The local case was not found." } }, origin);
    try {
      const body = await readJson(request);
      if (body.humanConfirmed !== true) return json(response, 400, { error: { code: "HUMAN_CONFIRMATION_REQUIRED", message: "A human confirmation is required for this local case transition." } }, origin);
      if (body.action === "acknowledge") {
        if (item.status === "pending_human") {
          item.status = "acknowledged";
          item.updatedAt = new Date().toISOString();
          audit.push({ id: randomUUID(), pipelineId: item.pipelineId, actor: "local-demo-user", action: "human_escalation.acknowledged", stage: item.stage, state: "failed", timestamp: item.updatedAt });
          emit("escalation.updated", item);
        }
        return json(response, 200, item, origin);
      }
      if (body.action === "resolve" && item.status === "acknowledged" && resolutionCodes.has(body.resolutionCode)) {
        item.status = "resolved";
        item.resolutionCode = body.resolutionCode;
        item.updatedAt = new Date().toISOString();
        audit.push({ id: randomUUID(), pipelineId: item.pipelineId, actor: "local-demo-user", action: "human_escalation.resolved", stage: item.stage, state: "failed", timestamp: item.updatedAt });
        emit("escalation.updated", item);
        return json(response, 200, item, origin);
      }
      return json(response, 409, { error: { code: "INVALID_CASE_TRANSITION", message: "This local case transition is not allowed." } }, origin);
    } catch (error) {
      const status = error.status || 400;
      return json(response, status, { error: { code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST", message: "The local case transition could not be recorded." } }, origin);
    }
  }
  if (request.method === "GET" && path === "/api/home-readiness") {
    return json(response, 200, homeReadiness, origin);
  }
  if (request.method === "POST" && path === "/api/home-readiness") {
    try {
      const body = await readJson(request);
      const leaseReference = String(body.leaseReference || "").trim();
      if (!leaseReference.startsWith("synthetic:") || leaseReference.length > 100 || body.leaseProofReviewed !== true || body.humanApproved !== true) {
        return json(response, 400, { error: { code: "HOME_READINESS_APPROVAL_REQUIRED", message: "A synthetic lease reference and both human review gates are required." } }, origin);
      }
      Object.assign(homeReadiness, { leaseReference, leaseProofReviewed: true, humanApproved: true, updatedAt: new Date().toISOString() });
      emit("home_readiness.gate.recorded", { gateRecorded: true });
      return json(response, 200, homeReadiness, origin);
    } catch (error) {
      const status = error.status || 400;
      return json(response, status, { error: { code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST", message: "Home-readiness review could not be recorded." } }, origin);
    }
  }
  if (request.method === "GET" && path === "/api/resilience") {
    return json(response, 200, resilience, origin);
  }
  if (request.method === "POST" && path === "/api/resilience/reviews") {
    try {
      const body = await readJson(request);
      const reviewedAt = String(body.reviewedAt || "");
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(reviewedAt) && !Number.isNaN(Date.parse(`${reviewedAt}T00:00:00Z`)) && reviewedAt <= new Date().toISOString().slice(0, 10);
      if (body.humanConfirmed !== true || !validDate || !["gaps_identified", "no_known_gaps"].includes(body.outcome)) {
        return json(response, 400, { error: { code: "INVALID_TABLETOP_REVIEW", message: "A dated, human-confirmed tabletop outcome is required." } }, origin);
      }
      const review = { id: randomUUID(), evidenceType: "tabletop_only", reviewedAt, outcome: body.outcome, failoverExecuted: false };
      resilience.reviews.push(review);
      emit("resilience.tabletop_review.recorded", { id: review.id });
      return json(response, 201, review, origin);
    } catch (error) {
      const status = error.status || 400;
      return json(response, status, { error: { code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST", message: "The tabletop note could not be recorded." } }, origin);
    }
  }
  if (request.method !== "POST" || path !== "/api/onboarding") {
    return json(response, 404, { error: { code: "NOT_FOUND", message: "Not found." } }, origin);
  }

  try {
    const body = await readJson(request);
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.identityToken || "").trim();
    if (!firstName || !lastName || !email.includes("@") || !token) {
      return json(response, 400, { error: { code: "INVALID_REQUEST", message: "Valid synthetic onboarding fields are required." } }, origin);
    }
    const candidate = { firstName, lastName, email };
    const key = String(request.headers["idempotency-key"] || email).trim();
    const existing = idempotency.get(key);
    if (existing) {
      if (JSON.stringify(existing.candidate) !== JSON.stringify(candidate)) {
        return json(response, 409, { error: { code: "IDEMPOTENCY_CONFLICT", message: "This idempotency key belongs to another candidate." } }, origin);
      }
      return json(response, 200, existing.response, origin);
    }
    if ([...pipelines.values()].some((item) => item.candidate.email === email)) {
      return json(response, 409, { error: { code: "EMAIL_ALREADY_ONBOARDED", message: "This email already has a pipeline." } }, origin);
    }

    const failed = token === "demo:fail-icp";
    const now = new Date().toISOString();
    const pipelineId = randomUUID();
    const summary = {
      pipelineId, candidate, stage: failed ? "icp" : "complete",
      state: failed ? "failed" : "completed", createdAt: now, updatedAt: now,
    };
    const result = {
      pipelineId, candidate, stage: summary.stage, state: summary.state,
      events: failed
        ? [{ stage: "identity", state: "completed" }, { stage: "icp", state: "failed" }]
        : ["identity", "icp", "banking", "travel", "logistics", "complete"].map((stage) => ({ stage, state: "completed" })),
    };
    pipelines.set(pipelineId, summary);
    if (failed) {
      result.exception = {
        id: randomUUID(), pipelineId, stage: "icp", code: "ICP_DEMO_REJECTION",
        message: "Mock ICP provider rejected the synthetic identity token.", occurredAt: now,
      };
      result.escalation = {
        id: randomUUID(), pipelineId, stage: "icp", severity: "high",
        owningTeam: "icp_case_management", status: "pending_human",
        requiredNextAction: "Review the mock ICP rejection and determine the next compliant case step.",
        createdAt: now,
      };
      exceptions.unshift(result.exception);
      escalations.unshift(result.escalation);
      audit.push({
        id: randomUUID(),
        pipelineId,
        actor: "saga-orchestrator",
        action: "human_escalation.created",
        stage: "icp",
        state: "failed",
        timestamp: now,
        escalation: {
          escalationId: result.escalation.id,
          severity: "high",
          owningTeam: "icp_case_management",
          status: "pending_human",
          requiredNextAction: result.escalation.requiredNextAction,
        },
      });
    }
    idempotency.set(key, { candidate, response: result });
    emit("pipeline.updated", summary);
    if (result.exception) emit("exception.created", result.exception);
    if (result.escalation) emit("escalation.created", result.escalation);
    return json(response, 201, result, origin);
  } catch (error) {
    const status = error.status || 400;
    return json(response, status, { error: { code: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST", message: status === 413 ? "Request body exceeds 16 KiB." : "Request body must be valid JSON." } }, origin);
  }
});

server.listen(port, host, () => console.log(`Loopback dashboard mock API listening at http://${host}:${port}`));
