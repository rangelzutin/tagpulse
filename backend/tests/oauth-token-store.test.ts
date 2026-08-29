import { describe, expect, it } from "vitest";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";

describe("TagPlus OAuth token store", () => {
  it("starts empty, stores, replaces and clears synthetic state", () => {
    const store = createTagPlusOAuthTokenStore();
    expect(store.get()).toBeUndefined();
    store.set({
      accessToken: "synthetic-token-one",
      refreshToken: "synthetic-refresh-one",
    });
    expect(store.get()).toEqual({
      accessToken: "synthetic-token-one",
      refreshToken: "synthetic-refresh-one",
    });
    store.set({ accessToken: "synthetic-token-two" });
    expect(store.get()).toEqual({ accessToken: "synthetic-token-two" });
    store.clear();
    expect(store.get()).toBeUndefined();
  });
});
