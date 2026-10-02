import * as Crypto from 'expo-crypto';
import { getEncryptedDatabase } from './encryptedDatabase.ts';
import { IdentityVault } from '../vault/identityVault.ts';
import type { OnboardingDraft, OnboardingResponse, OutboxItem, PendingOutboxItem } from '../types.ts';

type DatabaseRow = {
  idempotency_key: string;
  first_name: string;
  last_name: string;
  email: string;
  status: OutboxItem['status'];
  attempts: number;
  created_at: string;
  pipeline_id: string | null;
  server_state: string | null;
  stage: string | null;
  error_code: string | null;
};

export class OutboxRepository {
  private readonly vault: IdentityVault;

  constructor(vault = new IdentityVault()) {
    this.vault = vault;
  }

  async getDraft(): Promise<Pick<OnboardingDraft, 'firstName' | 'lastName' | 'email'>> {
    const database = await getEncryptedDatabase();
    const row = await database.getFirstAsync<{ first_name: string; last_name: string; email: string }>(
      'SELECT first_name, last_name, email FROM onboarding_draft WHERE draft_id = 1',
    );
    return { firstName: row?.first_name ?? '', lastName: row?.last_name ?? '', email: row?.email ?? '' };
  }

  async saveDraft(draft: Pick<OnboardingDraft, 'firstName' | 'lastName' | 'email'>): Promise<void> {
    const database = await getEncryptedDatabase();
    await database.runAsync(
      `INSERT INTO onboarding_draft (draft_id, first_name, last_name, email, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(draft_id) DO UPDATE SET first_name = excluded.first_name,
         last_name = excluded.last_name, email = excluded.email, updated_at = excluded.updated_at`,
      draft.firstName,
      draft.lastName,
      draft.email,
      new Date().toISOString(),
    );
  }

  async clearDraft(): Promise<void> {
    const database = await getEncryptedDatabase();
    await database.runAsync('DELETE FROM onboarding_draft WHERE draft_id = 1');
  }

  async enqueue(draft: OnboardingDraft): Promise<OutboxItem> {
    const idempotencyKey = Crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Save the opaque token in Keychain/Keystore before creating its encrypted outbox row.
    await this.vault.storeTokenReference(idempotencyKey, draft.identityToken);
    try {
      const database = await getEncryptedDatabase();
      await database.runAsync(
        `INSERT INTO sync_outbox (
          idempotency_key, first_name, last_name, email, status, created_at
        ) VALUES (?, ?, ?, ?, 'queued', ?)`,
        idempotencyKey,
        draft.firstName,
        draft.lastName,
        draft.email,
        createdAt,
      );
    } catch (error) {
      await this.vault.deleteTokenReference(idempotencyKey);
      throw error;
    }

    const item = await this.getById(idempotencyKey);
    if (!item) throw new Error('The local onboarding record could not be read after saving.');
    return item;
  }

  async getPending(limit = 20): Promise<PendingOutboxItem[]> {
    const database = await getEncryptedDatabase();
    const rows = await database.getAllAsync<DatabaseRow>(
      `SELECT * FROM sync_outbox
       WHERE status IN ('queued', 'retry', 'sending') AND next_attempt_at <= ?
       ORDER BY created_at ASC LIMIT ?`,
      Date.now(),
      limit,
    );
    return rows.map((row) => this.mapPendingRow(row));
  }

  async getAll(): Promise<OutboxItem[]> {
    const database = await getEncryptedDatabase();
    const rows = await database.getAllAsync<DatabaseRow>(
      `SELECT * FROM sync_outbox ORDER BY created_at DESC LIMIT 50`,
    );
    return rows.map((row) => this.mapRow(row));
  }

  async markSending(idempotencyKey: string): Promise<number> {
    const database = await getEncryptedDatabase();
    await database.runAsync(
      `UPDATE sync_outbox SET status = 'sending', attempts = attempts + 1, error_code = NULL
       WHERE idempotency_key = ? AND status IN ('queued', 'retry', 'sending')`,
      idempotencyKey,
    );
    const item = await this.getById(idempotencyKey);
    return item?.attempts ?? 0;
  }

  async markRetry(idempotencyKey: string, errorCode: string, retryAfterMs: number): Promise<void> {
    const database = await getEncryptedDatabase();
    await database.runAsync(
      `UPDATE sync_outbox SET status = 'retry', error_code = ?, next_attempt_at = ?
       WHERE idempotency_key = ?`,
      errorCode.slice(0, 80),
      Date.now() + retryAfterMs,
      idempotencyKey,
    );
  }

  async markAttention(idempotencyKey: string, errorCode: string): Promise<void> {
    const database = await getEncryptedDatabase();
    await database.runAsync(
      `UPDATE sync_outbox SET status = 'attention', error_code = ? WHERE idempotency_key = ?`,
      errorCode.slice(0, 80),
      idempotencyKey,
    );
    await this.vault.deleteTokenReference(idempotencyKey);
  }

  async markSynced(idempotencyKey: string, result: OnboardingResponse): Promise<void> {
    const database = await getEncryptedDatabase();
    await database.runAsync(
      `UPDATE sync_outbox SET status = 'synced', pipeline_id = ?, server_state = ?, stage = ?,
       next_attempt_at = 0, error_code = NULL WHERE idempotency_key = ?`,
      result.pipelineId,
      result.state,
      result.stage,
      idempotencyKey,
    );
    await this.vault.deleteTokenReference(idempotencyKey);
  }

  async getNextRetryAt(): Promise<number | null> {
    const database = await getEncryptedDatabase();
    const row = await database.getFirstAsync<{ next_attempt_at: number }>(
      `SELECT MIN(next_attempt_at) AS next_attempt_at FROM sync_outbox WHERE status = 'retry'`,
    );
    return row?.next_attempt_at ?? null;
  }

  private async getById(idempotencyKey: string): Promise<OutboxItem | null> {
    const database = await getEncryptedDatabase();
    const row = await database.getFirstAsync<DatabaseRow>(
      'SELECT * FROM sync_outbox WHERE idempotency_key = ?',
      idempotencyKey,
    );
    return row ? this.mapRow(row) : null;
  }

  private mapPendingRow(row: DatabaseRow): PendingOutboxItem {
    return this.mapRow(row) as PendingOutboxItem;
  }

  private mapRow(row: DatabaseRow): OutboxItem {
    return {
      idempotencyKey: row.idempotency_key,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.created_at,
      pipelineId: row.pipeline_id,
      state: row.server_state,
      stage: row.stage,
      errorCode: row.error_code,
    };
  }
}

export const outboxRepository = new OutboxRepository();
