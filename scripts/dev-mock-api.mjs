import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const host = "127.0.0.1";
const port = Number(process.env.MOCK_API_PORT || 8080);
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);
const pipelines = new Map();
const exceptions = [];
const escalations = [];
const idempotency = new Map();
const eventClients = new Set();

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
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
  if (request.method === "GET" && path === "/api/audit") return json(response, 200, { items: [] }, origin);
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
