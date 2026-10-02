import type { OnboardingDraft } from './types.ts';

const TOKEN_REFERENCE = /^tok_[A-Za-z0-9_-]{8,120}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationErrors = Partial<Record<keyof OnboardingDraft, string>>;

export function isSyntheticIdentityToken(value: string): boolean {
  return TOKEN_REFERENCE.test(value.trim());
}

export function normalizeOnboardingDraft(draft: OnboardingDraft): OnboardingDraft {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim().toLowerCase(),
    identityToken: draft.identityToken.trim(),
  };
}

export function validateOnboardingDraft(draft: OnboardingDraft): ValidationErrors {
  const normalized = normalizeOnboardingDraft(draft);
  const errors: ValidationErrors = {};

  if (!normalized.firstName) errors.firstName = 'Enter your first name.';
  if (!normalized.lastName) errors.lastName = 'Enter your last name.';
  if (!EMAIL.test(normalized.email)) errors.email = 'Enter a valid email address.';
  if (!isSyntheticIdentityToken(normalized.identityToken)) {
    errors.identityToken = 'Use a token reference beginning with tok_. Do not enter document numbers or upload a document.';
  }

  return errors;
}
