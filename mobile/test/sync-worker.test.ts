import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OnboardingApiError, type SubmitOnboarding } from '../src/sync/onboardingApi.ts';
import { SyncWorker } from '../src/sync/syncWorker.ts';
import type { OnboardingResponse, PendingOutboxItem } from '../src/types.ts';

const key = '123e4567-e89b-12d3-a456-426614174000';
const item: PendingOutboxItem = {
  idempotencyKey: key,
  firstName: 'Amira',
  lastName: "O'Neil",
  email: 'amira@example.test',
  status: 'queued',
  attempts: 0,
  createdAt: '2026-10-02T00:00:00.000Z',
  pipelineId: null,
  state: null,
  stage: null,
  errorCode: null,
};
const receipt: OnboardingResponse = { pipelineId: 'pipe_01', state: 'IN_PROGRESS', stage: 'ICP_VISA', events: [] };

class FakeOutbox {
  pending: PendingOutboxItem[] = [{ ...item }];
  saved: OnboardingResponse | undefined;
  retry: { code: string; after: number } | undefined;
  attention: string | undefined;
  attempts = 0;

  async getPending(): Promise<PendingOutboxItem[]> { return this.pending; }
  async markSending(): Promise<number> { this.attempts += 1; return this.attempts; }
  async markRetry(_key: string, code: string, after: number): Promise<void> { this.retry = { code, after }; }
  async markAttention(_key: string, code: string): Promise<void> { this.attention = code; }
  async markSynced(_key: string, result: OnboardingResponse): Promise<void> { this.saved = result; this.pending = []; }
}

class FakeVault {
  private readonly token: string | null;
  constructor(token: string | null = 'tok_demo_ref_1234ABCD') { this.token = token; }
  async getTokenReference(): Promise<string | null> { return this.token; }
}

test('sends the tokenized record once and commits the returned pipeline receipt', async () => {
  const outbox = new FakeOutbox();
  const requests: Array<{ idempotencyKey: string; payload: unknown }> = [];
  const submit: SubmitOnboarding = async (idempotencyKey, payload) => {
    requests.push({ idempotencyKey, payload });
    return receipt;
  };
  const worker = new SyncWorker(outbox, new FakeVault(), submit);

  const result = await worker.syncPending();

  assert.deepEqual(result, { synced: 1, retrying: 0, needsAttention: 0 });
  assert.equal(requests[0].idempotencyKey, key);
  assert.deepEqual(requests[0].payload, {
    firstName: 'Amira',
    lastName: "O'Neil",
    email: 'amira@example.test',
    identityToken: 'tok_demo_ref_1234ABCD',
  });
  assert.equal(outbox.saved, receipt);
});

test('uses bounded exponential retry and preserves the idempotency key after a network error', async () => {
  const outbox = new FakeOutbox();
  const submit: SubmitOnboarding = async () => { throw new OnboardingApiError('network_unavailable', null); };
  const worker = new SyncWorker(outbox, new FakeVault(), submit, () => 1_000);

  const result = await worker.syncPending();

  assert.deepEqual(result, { synced: 0, retrying: 1, needsAttention: 0 });
  assert.deepEqual(outbox.retry, { code: 'network_unavailable', after: 1_000 });
});

test('moves missing identity token references to attention without a network call', async () => {
  const outbox = new FakeOutbox();
  let submitted = false;
  const worker = new SyncWorker(outbox, new FakeVault(null), async () => {
    submitted = true;
    return receipt;
  });

  const result = await worker.syncPending();

  assert.equal(submitted, false);
  assert.equal(outbox.attention, 'identity_token_missing');
  assert.deepEqual(result, { synced: 0, retrying: 0, needsAttention: 1 });
});

test('does not retry permanent client errors', async () => {
  const outbox = new FakeOutbox();
  const worker = new SyncWorker(outbox, new FakeVault(), async () => {
    throw new OnboardingApiError('http_422', 422);
  });

  const result = await worker.syncPending();

  assert.equal(outbox.attention, 'http_422');
  assert.equal(outbox.retry, undefined);
  assert.deepEqual(result, { synced: 0, retrying: 0, needsAttention: 1 });
});

test('only accepts synthetic token references as sync credentials', async () => {
  const outbox = new FakeOutbox();
  let submitted = false;
  const worker = new SyncWorker(outbox, new FakeVault('P12345678'), async () => {
    submitted = true;
    return receipt;
  });

  await worker.syncPending();
  assert.equal(submitted, false);
  assert.equal(outbox.attention, 'identity_token_missing');
});
