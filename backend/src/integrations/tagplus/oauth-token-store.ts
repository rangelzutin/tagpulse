import type { TagPlusTokens } from "./oauth.js";

export interface TagPlusOAuthTokenStore {
  get(): TagPlusTokens | undefined;
  set(tokens: TagPlusTokens): void;
  clear(): void;
}

export function createTagPlusOAuthTokenStore(): TagPlusOAuthTokenStore {
  let current: TagPlusTokens | undefined;
  return {
    get: () => current,
    set(tokens) {
      current = { ...tokens };
    },
    clear() {
      current = undefined;
    },
  };
}
