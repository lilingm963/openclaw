import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type StoredToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope?: string;
};

/** Map of userOpenId -> StoredToken */
export type TokenStore = Record<string, StoredToken>;

function tokenStorePath(accountId: string): string {
  return join(homedir(), ".openclaw", "credentials", `feishu-oauth-${accountId}.json`);
}

export async function loadTokenStore(accountId: string): Promise<TokenStore> {
  const path = tokenStorePath(accountId);
  if (!existsSync(path)) {
    return {};
  }
  const raw = await fs.readFile(path, "utf-8");
  return JSON.parse(raw) as TokenStore;
}

export async function saveTokenStore(accountId: string, store: TokenStore): Promise<void> {
  const path = tokenStorePath(accountId);
  const dir = join(homedir(), ".openclaw", "credentials");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export async function getStoredToken(
  accountId: string,
  userOpenId: string,
): Promise<StoredToken | undefined> {
  const store = await loadTokenStore(accountId);
  return store[userOpenId];
}

export async function storeToken(
  accountId: string,
  userOpenId: string,
  token: StoredToken,
): Promise<void> {
  const store = await loadTokenStore(accountId);
  store[userOpenId] = token;
  await saveTokenStore(accountId, store);
}
