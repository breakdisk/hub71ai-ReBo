import type { OnboardingDraft, OnboardingResponse } from '../types.ts';

export class OnboardingApiError extends Error {
  readonly status: number | null;

  constructor(
    message: string,
    status: number | null,
  ) {
    super(message);
    this.name = 'OnboardingApiError';
    this.status = status;
  }

  get retryable(): boolean {
    return this.status === null || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  const baseUrl = (configured || 'http://localhost:8080').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('The API URL must start with http:// or https://.');
  return baseUrl;
}

export type SubmitOnboarding = (
  idempotencyKey: string,
  payload: Omit<OnboardingDraft, 'identityToken'> & { identityToken: string },
) => Promise<OnboardingResponse>;

export class OnboardingApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    baseUrl = getApiBaseUrl(),
    fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async submit(idempotencyKey: string, payload: OnboardingDraft): Promise<OnboardingResponse> {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      response = await this.fetcher(`${this.baseUrl}/api/onboarding`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      // Do not propagate fetch errors: native error strings can contain request details.
      throw new OnboardingApiError('network_unavailable', null);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new OnboardingApiError(`http_${response.status}`, response.status);

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new OnboardingApiError('invalid_server_response', null);
    }
    if (!isOnboardingResponse(result)) throw new OnboardingApiError('invalid_server_response', null);
    return result;
  }
}

function isOnboardingResponse(value: unknown): value is OnboardingResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return typeof response.pipelineId === 'string'
    && typeof response.state === 'string'
    && typeof response.stage === 'string';
}
