import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

const requiredCopy = [
  "CANDIDATE-LED · OPTIONAL",
  "no preference is saved or sent",
  "No balance or compliance result",
  "legally approved, versioned ruleset is configured",
  "NO ASSIGNMENTS",
  "Two required human gates",
  "Lease proof",
  "Human approval",
  "READINESS UNKNOWN",
  "Region inventory",
  "RPO target",
  "RTO target",
  "No recovery-readiness claim can be made.",
  "request(\"/api/escalations\")",
  "stream.addEventListener(\"escalation.created\"",
];

for (const phrase of requiredCopy) {
  assert.ok(source.includes(phrase), `Missing safety/readiness copy: ${phrase}`);
}

const handover = source.match(/<article class="readiness-card handover-card">([\s\S]*?)<\/article>/)?.[1];
assert.ok(handover, "Utility/home handover surface must exist");
assert.match(handover, /Lease proof[\s\S]*?Required · not provided/);
assert.match(handover, /Human approval[\s\S]*?Required · pending/);
assert.match(handover, /<button class="disabled-action"[^>]*disabled/);

const dr = source.match(/<article class="readiness-card dr-card">([\s\S]*?)<\/article>/)?.[1];
assert.ok(dr, "Disaster-recovery surface must exist");
assert.match(dr, /Region inventory<\/span><strong>Not configured<\/strong>/);
assert.match(dr, /RPO target<\/span><strong>Unknown<\/strong>/);
assert.match(dr, /RTO target<\/span><strong>Unknown<\/strong>/);
assert.match(dr, /<span class="readiness-state unknown">READINESS UNKNOWN<\/span>/);
assert.doesNotMatch(dr, /<span class="readiness-state [^"]+">(?:GREEN|HEALTHY|READY)<\/span>/i, "Unconfigured disaster recovery must never appear healthy");

const warRoom = source.match(/<article class="readiness-card escalation-card">([\s\S]*?)<\/article>/)?.[1];
assert.ok(warRoom, "Human escalation surface must exist");
assert.match(warRoom, /Mobility specialist<\/span><strong>Unassigned<\/strong>/);
assert.match(warRoom, /<button class="disabled-action"[^>]*disabled/);
assert.doesNotMatch(warRoom, /Acknowledge|Assign now/i, "No unauthenticated escalation actions may be offered");

const communityHandler = source.match(/document\.querySelector\("#community-preview-toggle"\)[\s\S]*?\n\}\);/)?.[0];
assert.ok(communityHandler, "Opt-in preview interaction must exist");
assert.match(communityHandler, /aria-pressed/);
assert.match(communityHandler, /preview\.hidden/);
assert.doesNotMatch(communityHandler, /fetch\(|request\(/, "Community opt-in preview must stay local-only");

console.log("Readiness prototype checks passed (copy, human gates, unknown DR targets, local-only opt-in preview).");
