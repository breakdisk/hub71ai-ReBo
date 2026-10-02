import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSyntheticIdentityToken, normalizeOnboardingDraft, validateOnboardingDraft } from '../src/onboardingValidation.ts';

test('normalizes user input and validates an onboarding draft', () => {
  const input = { firstName: ' Amira ', lastName: " O'Neil ", email: ' AMIRA@example.test ', identityToken: ' tok_demo_ref_1234ABCD ' };
  assert.deepEqual(validateOnboardingDraft(input), {});
  assert.deepEqual(normalizeOnboardingDraft(input), {
    firstName: 'Amira',
    lastName: "O'Neil",
    email: 'amira@example.test',
    identityToken: 'tok_demo_ref_1234ABCD',
  });
});

test('rejects empty fields, invalid email, and raw document-like values', () => {
  const errors = validateOnboardingDraft({ firstName: '', lastName: 'X', email: 'bad-email', identityToken: 'P12345678' });
  assert.ok(errors.firstName);
  assert.ok(errors.email);
  assert.ok(errors.identityToken);
  assert.equal(isSyntheticIdentityToken('passport-number-P12345678'), false);
});
