import fs from "node:fs";
import path from "node:path";
import type { TagPlusTokens } from "./oauth.js";

const TOKEN_FILE_PATH = path.resolve(process.cwd(), ".tagplus-token.json");
const isTestEnv =
  process.env.NODE_ENV === "test" || process.env.VITEST === "true";

export interface TagPlusOAuthTokenStore {
  get(): TagPlusTokens | undefined;
  set(tokens: TagPlusTokens): void;
  clear(): void;
}

export interface TagPlusOAuthTokenStoreOptions {
  filePath?: string | null;
}

export function createTagPlusOAuthTokenStore(
  options?: TagPlusOAuthTokenStoreOptions,
): TagPlusOAuthTokenStore {
  const defaultPath = isTestEnv ? null : TOKEN_FILE_PATH;
  const filePath =
    options?.filePath === null
      ? null
      : (options?.filePath ?? defaultPath);

  let current: TagPlusTokens | undefined;

  function loadFromFile(): TagPlusTokens | undefined {
    if (!filePath) return undefined;
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.accessToken === "string") {
          return {
            ...parsed,
            expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
          };
        }
      }
    } catch {
      // Ignora erro de leitura
    }
    return undefined;
  }

  function saveToFile(tokens: TagPlusTokens): void {
    if (!filePath) return;
    try {
      fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), "utf-8");
    } catch {
      // Ignora erro de gravação
    }
  }

  current = loadFromFile();

  return {
    get: () => {
      if (!current && filePath) {
        current = loadFromFile();
      }
      return current;
    },
    set(tokens) {
      current = { ...tokens };
      saveToFile(current);
    },
    clear() {
      current = undefined;
      if (filePath) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Ignora erro
        }
      }
    },
  };
}
