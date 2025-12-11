/**
 * Global type declarations for React Native environment
 * These are available at runtime in React Native
 */

declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
};

declare function require(id: string): unknown;

declare const __DEV__: boolean;

declare const global: {
  [key: string]: unknown;
};
