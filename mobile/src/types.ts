export type OnboardingDraft = {
  firstName: string;
  lastName: string;
  email: string;
  identityToken: string;
};

export type CandidateReceipt = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type OnboardingResponse = {
  pipelineId: string;
  state: string;
  stage: string;
  candidate?: CandidateReceipt;
  events?: unknown[];
};

export type OutboxStatus = 'queued' | 'sending' | 'retry' | 'synced' | 'attention';

export type OutboxItem = {
  idempotencyKey: string;
  firstName: string;
  lastName: string;
  email: string;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  pipelineId: string | null;
  state: string | null;
  stage: string | null;
  errorCode: string | null;
};

export type PendingOutboxItem = OutboxItem & {
  status: 'queued' | 'retry' | 'sending';
};
