import { isSyntheticIdentityToken } from '../onboardingValidation.ts';
import { OnboardingApiError, type SubmitOnboarding } from './onboardingApi.ts';
import type { OnboardingDraft, OutboxItem, PendingOutboxItem } from '../types.ts';

export interface SyncOutbox {
  getPending(limit?: number): Promise<PendingOutboxItem[]>;
  markSending(idempotencyKey: string): Promise<number>;
  markRetry(idempotencyKey: string, errorCode: string, retryAfterMs: number): Promise<void>;
  markAttention(idempotencyKey: string, errorCode: string): Promise<void>;
  markSynced(idempotencyKey: string, result: Awaited<ReturnType<SubmitOnboarding>>): Promise<void>;
}

export interface TokenVault {
  getTokenReference(idempotencyKey: string): Promise<string | null>;
}

export type SyncSummary = {
  synced: number;
  retrying: number;
  needsAttention: number;
};

const MAX_RETRY_MS = 60_000;

export class SyncWorker {
  private running = false;
  private readonly outbox: SyncOutbox;
  private readonly vault: TokenVault;
  private readonly submit: SubmitOnboarding;
  private readonly now: () => number;

  constructor(
    outbox: SyncOutbox,
    vault: TokenVault,
    submit: SubmitOnboarding,
    now: () => number = Date.now,
  ) {
    this.outbox = outbox;
    this.vault = vault;
    this.submit = submit;
    this.now = now;
  }

  async syncPending(): Promise<SyncSummary> {
    if (this.running) return { synced: 0, retrying: 0, needsAttention: 0 };
    this.running = true;
    const summary: SyncSummary = { synced: 0, retrying: 0, needsAttention: 0 };

    try {
      const pending = await this.outbox.getPending();
      for (const item of pending) {
        const result = await this.syncOne(item);
        summary[result] += 1;
        // On a transient outage leave the rest queued and let connectivity/retry wake it up.
        if (result === 'retrying') break;
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  private async syncOne(item: PendingOutboxItem): Promise<keyof SyncSummary> {
    const tokenReference = await this.vault.getTokenReference(item.idempotencyKey);
    if (!tokenReference || !isSyntheticIdentityToken(tokenReference)) {
      await this.outbox.markAttention(item.idempotencyKey, 'identity_token_missing');
      return 'needsAttention';
    }

    const attempts = await this.outbox.markSending(item.idempotencyKey);
    const payload: OnboardingDraft = {
      firstName: item.firstName,
      lastName: item.lastName,
      email: item.email,
      identityToken: tokenReference,
    };

    try {
      const response = await this.submit(item.idempotencyKey, payload);
      await this.outbox.markSynced(item.idempotencyKey, response);
      return 'synced';
    } catch (error) {
      if (error instanceof OnboardingApiError && !error.retryable) {
        await this.outbox.markAttention(item.idempotencyKey, `http_${error.status}`);
        return 'needsAttention';
      }

      const retryAfterMs = Math.min(1_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6), MAX_RETRY_MS);
      const errorCode = error instanceof OnboardingApiError
        ? error.message
        : 'sync_failed';
      await this.outbox.markRetry(item.idempotencyKey, errorCode, retryAfterMs);
      return 'retrying';
    }
  }
}
