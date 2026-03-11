import type * as Lark from "@larksuiteoapi/node-sdk";
import { getStoredToken, storeToken, type StoredToken } from "./oauth-store.js";

/** 3-minute buffer before token expiry to trigger refresh */
const REFRESH_BUFFER_MS = 3 * 60 * 1000;

export const DEFAULT_FEISHU_OAUTH_SCOPES = [
  "drive:drive",
  "wiki:wiki",
  "docx:document",
  "bitable:app",
] as const;

function normalizeScopes(scopes: readonly string[] | undefined): string[] {
  const normalized = scopes?.map((scope) => scope.trim()).filter((scope) => scope.length > 0);
  return normalized ? Array.from(new Set(normalized)) : [];
}

export function resolveAuthorizationScopes(scopes?: readonly string[]): string[] {
  const configuredScopes = normalizeScopes(scopes);
  return configuredScopes.length > 0 ? configuredScopes : [...DEFAULT_FEISHU_OAUTH_SCOPES];
}

/**
 * Build the Feishu/Lark OAuth authorization URL.
 */
export function buildAuthorizationUrl(params: {
  appId: string;
  domain: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
}): string {
  const baseUrl =
    params.domain === "lark"
      ? "https://open.larksuite.com/open-apis/authen/v1/authorize"
      : "https://open.feishu.cn/open-apis/authen/v1/authorize";

  const url = new URL(baseUrl);
  url.searchParams.set("app_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", resolveAuthorizationScopes(params.scopes).join(" "));
  if (params.state) {
    url.searchParams.set("state", params.state);
  }
  return url.toString();
}

type TokenResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
};

/**
 * Exchange an authorization code for user access + refresh tokens.
 */
export async function exchangeCodeForToken(
  client: Lark.Client,
  code: string,
): Promise<TokenResult> {
  const res = await client.authen.oidcAccessToken.create({
    data: { grant_type: "authorization_code", code },
  });
  if (res.code !== 0) {
    throw new Error(`OAuth code exchange failed: ${res.msg ?? "unknown error"}`);
  }
  const data = res.data;
  if (!data?.access_token) {
    throw new Error("OAuth code exchange returned no access_token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    scope: data.scope,
  };
}

/**
 * Refresh an expired user access token.
 */
export async function refreshUserToken(
  client: Lark.Client,
  refreshToken: string,
): Promise<TokenResult> {
  const res = await client.authen.oidcRefreshAccessToken.create({
    data: { grant_type: "refresh_token", refresh_token: refreshToken },
  });
  if (res.code !== 0) {
    throw new Error(`OAuth token refresh failed: ${res.msg ?? "unknown error"}`);
  }
  const data = res.data;
  if (!data?.access_token) {
    throw new Error("OAuth token refresh returned no access_token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    scope: data.scope,
  };
}

/**
 * Get a valid user access token for the given user, auto-refreshing if needed.
 * Returns null if no stored token is available.
 */
export async function getUserAccessToken(params: {
  client: Lark.Client;
  accountId: string;
  userOpenId: string;
}): Promise<string | null> {
  const stored = await getStoredToken(params.accountId, params.userOpenId);
  if (!stored) {
    return null;
  }

  // Token still valid (with 3-min buffer)
  if (stored.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return stored.accessToken;
  }

  // Need to refresh
  if (!stored.refreshToken) {
    return null;
  }

  try {
    const refreshed = await refreshUserToken(params.client, stored.refreshToken);
    const updated: StoredToken = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: refreshed.scope ?? stored.scope,
    };
    await storeToken(params.accountId, params.userOpenId, updated);
    return updated.accessToken;
  } catch {
    // Refresh failed; token is no longer usable
    return null;
  }
}
