import fs from "node:fs";
import path from "node:path";
import type { TagPlusTokens } from "./oauth.js";

const TOKEN_FILE_PATH = path.resolve(process.cwd(), ".tagplus-token.json");

export interface TagPlusOAuthTokenStore {
  get(): TagPlusTokens | undefined;
  set(tokens: TagPlusTokens): void;
  clear(): void;
}

export function createTagPlusOAuthTokenStore(): TagPlusOAuthTokenStore {
  let current: TagPlusTokens | undefined;

  function loadFromFile(): TagPlusTokens | undefined {
    try {
      if (fs.existsSync(TOKEN_FILE_PATH)) {
        const raw = fs.readFileSync(TOKEN_FILE_PATH, "utf-8");
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
    try {
      fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(tokens, null, 2), "utf-8");
    } catch {
      // Ignora erro de gravação
    }
  }

  current = loadFromFile();

  return {
    get: () => {
      if (!current) {
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
      try {
        if (fs.existsSync(TOKEN_FILE_PATH)) {
          fs.unlinkSync(TOKEN_FILE_PATH);
        }
      } catch {
        // Ignora erro
      }
    },
  };
}
