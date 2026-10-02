import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OnboardingApiClient, OnboardingApiError } from '../src/sync/onboardingApi.ts';
import type { OnboardingDraft } from '../src/types.ts';

const draft: OnboardingDraft = {
  firstName: 'Amira',
  lastName: "O'Neil",
  email: 'amira@example.test',
  identityToken: 'tok_demo_ref_1234ABCD',
};
const responseBody = { pipelineId: 'pipe_01', state: 'IN_PROGRESS', stage: 'ICP_VISA', candidate: { id: 'candidate_01' }, events: [] };

test('submits only the onboarding contract with a stable idempotency header', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const client = new OnboardingApiClient('https://api.example.test', async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify(responseBody), { status: 201, headers: { 'Content-Type': 'application/json' } });
  });

  const result = await client.submit('123e4567-e89b-12d3-a456-426614174000', draft);

  assert.equal(requestUrl, 'https://api.example.test/api/onboarding');
  assert.equal(requestInit?.method, 'POST');
  assert.equal(new Headers(requestInit?.headers).get('Idempotency-Key'), '123e4567-e89b-12d3-a456-426614174000');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), draft);
  assert.equal(result.pipelineId, 'pipe_01');
});

test('does not read or expose an unsuccessful response body', async () => {
  let bodyRead = false;
  const client = new OnboardingApiClient('https://api.example.test', async () => ({
    ok: false,
    status: 422,
    json: async () => { bodyRead = true; return { sensitive: 'server echo' }; },
  } as Response));

  await assert.rejects(client.submit('key', draft), (error: unknown) => {
    assert.ok(error instanceof OnboardingApiError);
    assert.equal(error.message, 'http_422');
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(bodyRead, false);
});

test('maps transport errors to a generic retryable error without leaking fetch details', async () => {
  const client = new OnboardingApiClient('https://api.example.test', async () => {
    throw new Error('fetch failed with request body: passport scan');
  });

  await assert.rejects(client.submit('key', draft), (error: unknown) => {
    assert.ok(error instanceof OnboardingApiError);
    assert.equal(error.message, 'network_unavailable');
    assert.equal(error.retryable, true);
    return true;
  });
});

test('rejects malformed success responses', async () => {
  const client = new OnboardingApiClient('https://api.example.test', async () => new Response('{}', { status: 200 }));
  await assert.rejects(client.submit('key', draft), /invalid_server_response/);
});
