/// <reference types="expo/types" />

// Environment values with the EXPO_PUBLIC_ prefix are inlined by Expo at build time.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
  }
}
