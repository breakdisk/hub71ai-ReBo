import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OnboardingApiClient } from '../src/sync/onboardingApi.ts';
import { SyncWorker } from '../src/sync/syncWorker.ts';
import type { OnboardingResponse, PendingOutboxItem } from '../src/types.ts';

const record: PendingOutboxItem = {
  idempotencyKey: '123e4567-e89b-12d3-a456-426614174000',
  firstName: 'Amira',
  lastName: 'Example',
  email: 'amira@example.test',
  status: 'queued',
  attempts: 0,
  createdAt: '2026-10-02T00:00:00.000Z',
  pipelineId: null,
  state: null,
  stage: null,
  errorCode: null,
};

test('integrates outbox sync with the POST response and idempotency contract', async () => {
  let pending: PendingOutboxItem[] = [record];
  let storedReceipt: OnboardingResponse | undefined;
  let postedUrl = '';
  let postedHeaders: Headers | undefined;
  let postedBody: unknown;

  const client = new OnboardingApiClient('https://api.example.test', async (url, init) => {
    postedUrl = String(url);
    postedHeaders = new Headers(init?.headers);
    postedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      pipelineId: 'pipeline_abc',
      state: 'completed',
      stage: 'complete',
      candidate: { id: 'candidate_abc' },
      events: [{ id: 'event_1' }],
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  });
  const worker = new SyncWorker(
    {
      async getPending() { return pending; },
      async markSending() { return 1; },
      async markRetry() { assert.fail('successful response should not retry'); },
      async markAttention() { assert.fail('successful response should not need attention'); },
      async markSynced(_key, result) { storedReceipt = result; pending = []; },
    },
    { async getTokenReference() { return 'tok_synthetic_12345678'; } },
    (key, payload) => client.submit(key, payload),
  );

  const summary = await worker.syncPending();

  assert.equal(postedUrl, 'https://api.example.test/api/onboarding');
  assert.equal(postedHeaders?.get('Idempotency-Key'), record.idempotencyKey);
  assert.deepEqual(postedBody, {
    firstName: 'Amira',
    lastName: 'Example',
    email: 'amira@example.test',
    identityToken: 'tok_synthetic_12345678',
  });
  assert.equal(storedReceipt?.pipelineId, 'pipeline_abc');
  assert.deepEqual(summary, { synced: 1, retrying: 0, needsAttention: 0 });
});
