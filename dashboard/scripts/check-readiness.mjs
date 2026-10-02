import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const requiredSafetyCopy = [
  "LOCAL PROTOTYPE · HUMAN REVIEW REQUIRED",
  "No external providers, legal determinations, utility activation, or failover are performed.",
  "CANDIDATE-LED · OPTIONAL",
  "I confirm this is a synthetic demo opt-in, not consent from an actual candidate.",
  "This is not a real person’s consent.",
  "This demo does not track location.",
  "Family matchmaking and real-time local recommendations are not configured.",
  "The dashboard does not decide tax residence or calculate gratuity.",
  "Tax position",
  "Not determined",
  "Gratuity result",
  "Not calculated",
  "no one has been assigned.",
  "Utilities / IoT",
  "READINESS UNKNOWN",
  "No recovery-readiness claim can be made.",
];

for (const phrase of requiredSafetyCopy) {
  assert.ok(source.includes(phrase), `Missing safety/readiness copy: ${phrase}`);
}

const community = source.match(/function renderCommunity\(\) \{([\s\S]*?)\n\}/)?.[1];
assert.ok(community, "Candidate-led community preference flow must exist");
assert.match(source, /localStorage\.setItem\(COMMUNITY_CONSENT_KEY, "true"\)/);
assert.match(source, /localStorage\.removeItem\(COMMUNITY_CONSENT_KEY\)/);
assert.doesNotMatch(community, /fetch\(|request\(/, "Community preference must remain browser-local");
assert.match(source, /community-preview[\s\S]*?SYNTHETIC EXAMPLES · NOT LOCATION-AWARE/);

const mobility = source.match(/<article class="readiness-card tax-card">([\s\S]*?)<\/article>/)?.[1];
assert.ok(mobility, "Mobility tax/gratuity surface must exist");
assert.match(mobility, /id="travel-day-form"/);
assert.match(mobility, /name="consentAccepted" type="checkbox" required/);
assert.match(mobility, /name="humanConfirmed" type="checkbox" required/);
assert.match(mobility, /id="salary-change-form"/);
assert.match(source, /request\("\/api\/mobility\/travel-days"[\s\S]*?humanConfirmed: true, consentAccepted: true/);
assert.match(source, /request\("\/api\/mobility\/salary-changes"[\s\S]*?humanConfirmed: true/);
assert.match(source, /amount suppressed/);
assert.doesNotMatch(source, /taxResidencyDetermined|gratuityAmount|calculateGratuity|taxPosition\s*=/i, "No legal or gratuity calculation may be added to the prototype");

const warRoom = source.match(/<article class="readiness-card escalation-card">([\s\S]*?)<\/article>/)?.[1];
assert.ok(warRoom, "Human escalation surface must exist");
assert.match(warRoom, /Mobility specialist<\/span><strong>Unassigned<\/strong>/);
assert.match(warRoom, /Housing coordinator<\/span><strong>Unassigned<\/strong>/);
assert.match(source, /request\(`\/api\/escalations\/\$\{encodeURIComponent\(form\.dataset\.escalationId\)\}`,[\s\S]*?method: "PATCH"/);
assert.match(source, /humanConfirmed: true, action/);
for (const code of ["evidence_corrected", "provider_recovered", "approved_manual_resolution", "false_positive"]) {
  assert.ok(source.includes(`value="${code}"`), `Missing fixed escalation resolution code: ${code}`);
}
assert.match(source, /return state\.escalations\.filter\(\(item\) => item\.status !== "resolved"\)/, "Acknowledged cases must remain visible until resolved");
assert.doesNotMatch(warRoom, /direct.{0,24}channel.{0,24}enabled|send.{0,24}government/i, "No government contact action may be offered");

const home = source.match(/<article class="readiness-card handover-card">([\s\S]*?)<\/article>/)?.[1];
assert.ok(home, "Home/utility gate surface must exist");
assert.match(home, /name="leaseProofReviewed" type="checkbox" required/);
assert.match(home, /name="humanApproved" type="checkbox" required/);
assert.match(source, /request\("\/api\/home-readiness"[\s\S]*?leaseProofReviewed: true, humanApproved: true/);
assert.ok(/utilities\s*\/\s*IoT[\s\S]*?blocked/i.test(source), "Utility readiness must remain explicitly blocked");
assert.match(source, /utility and smart-home services remain blocked/i);
assert.doesNotMatch(home, /DEWA.{0,80}(?:request|activate)|Empower.{0,80}(?:request|activate)/i, "No utility provider activation may be wired");

const resilience = source.match(/<article class="readiness-card dr-card">([\s\S]*?)<\/article>/)?.[1];
assert.ok(resilience, "Multi-region resilience surface must exist");
assert.match(resilience, /READINESS UNKNOWN/);
assert.match(resilience, /RPO target/);
assert.match(resilience, /RTO target/);
assert.match(resilience, /name="humanConfirmed" type="checkbox" required/);
assert.match(source, /request\("\/api\/resilience\/reviews"[\s\S]*?humanConfirmed: true,[\s\S]*?outcome: data\.outcome/);
assert.match(source, /no failover was run/i);
assert.match(source, /posture stays unknown/i);
assert.doesNotMatch(source, /failover\(\)|promoteStandby|routeTraffic|dnsFailover/i, "No failover operation may be exposed");

assert.match(source, /request\("\/api\/escalations"\)/);
assert.match(source, /stream\.addEventListener\("escalation\.created"/);
assert.match(source, /stream\.addEventListener\("escalation\.updated"/);

console.log("Readiness prototype checks passed (local consent, synthetic mobility records, human escalation gates, blocked utilities, and unknown recovery posture).");
