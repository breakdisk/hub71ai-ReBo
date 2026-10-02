import * as SecureStore from 'expo-secure-store';
import { isSyntheticIdentityToken } from '../onboardingValidation.ts';

const TOKEN_PREFIX = 'onboard.identity-token.';
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Device vault for opaque synthetic token references. This interface deliberately
 * accepts no document bytes, images, OCR result objects, or raw identity numbers.
 */
export class IdentityVault {
  async storeTokenReference(idempotencyKey: string, tokenReference: string): Promise<void> {
    if (!isSyntheticIdentityToken(tokenReference)) {
      throw new Error('Only synthetic identity token references can be stored.');
    }
    await SecureStore.setItemAsync(
      this.keyFor(idempotencyKey),
      tokenReference,
      KEYCHAIN_OPTIONS,
    );
  }

  async getTokenReference(idempotencyKey: string): Promise<string | null> {
    const value = await SecureStore.getItemAsync(this.keyFor(idempotencyKey), KEYCHAIN_OPTIONS);
    if (!value) return null;
    return isSyntheticIdentityToken(value) ? value : null;
  }

  async deleteTokenReference(idempotencyKey: string): Promise<void> {
    await SecureStore.deleteItemAsync(this.keyFor(idempotencyKey), KEYCHAIN_OPTIONS);
  }

  private keyFor(idempotencyKey: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      throw new Error('Invalid local identity record key.');
    }
    return `${TOKEN_PREFIX}${idempotencyKey}`;
  }
}
