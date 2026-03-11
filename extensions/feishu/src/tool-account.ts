import type * as Lark from "@larksuiteoapi/node-sdk";
import { withUserAccessToken } from "@larksuiteoapi/node-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { resolveFeishuAccount } from "./accounts.js";
import { createFeishuClient } from "./client.js";
import { getUserAccessToken } from "./oauth.js";
import { resolveToolsConfig } from "./tools-config.js";
import type { FeishuToolContext, FeishuToolsConfig, ResolvedFeishuAccount } from "./types.js";

type AccountAwareParams = { accountId?: string };

function normalizeOptionalAccountId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readConfiguredDefaultAccountId(config: OpenClawPluginApi["config"]): string | undefined {
  const value = (config?.channels?.feishu as { defaultAccount?: unknown } | undefined)
    ?.defaultAccount;
  if (typeof value !== "string") {
    return undefined;
  }
  return normalizeOptionalAccountId(value);
}

export function resolveFeishuToolAccount(params: {
  api: Pick<OpenClawPluginApi, "config">;
  executeParams?: AccountAwareParams;
  defaultAccountId?: string;
}): ResolvedFeishuAccount {
  if (!params.api.config) {
    throw new Error("Feishu config unavailable");
  }
  return resolveFeishuAccount({
    cfg: params.api.config,
    accountId:
      normalizeOptionalAccountId(params.executeParams?.accountId) ??
      normalizeOptionalAccountId(params.defaultAccountId) ??
      readConfiguredDefaultAccountId(params.api.config),
  });
}

export function createFeishuToolClient(params: {
  api: Pick<OpenClawPluginApi, "config">;
  executeParams?: AccountAwareParams;
  defaultAccountId?: string;
}): Lark.Client {
  return createFeishuClient(resolveFeishuToolAccount(params));
}

/**
 * Create a tool context with optional user_access_token support.
 * If `userOpenId` is provided and a valid OAuth token is stored,
 * returns requestOptions for user-identity API calls.
 * Otherwise falls back to tenant_access_token (no requestOptions).
 */
export async function createFeishuToolContext(params: {
  api: Pick<OpenClawPluginApi, "config">;
  executeParams?: AccountAwareParams & { userOpenId?: string };
  defaultAccountId?: string;
  trustedRequesterOpenId?: string;
}): Promise<FeishuToolContext> {
  const account = resolveFeishuToolAccount(params);
  const client = createFeishuClient(account);
  const requestedUserOpenId =
    params.executeParams?.userOpenId?.trim() || params.trustedRequesterOpenId?.trim() || undefined;

  if (requestedUserOpenId) {
    const token = await getUserAccessToken({
      client,
      accountId: account.accountId,
      userOpenId: requestedUserOpenId,
    });
    if (token) {
      return { client, requestOptions: withUserAccessToken(token) };
    }
  }

  return { client };
}

export function resolveAnyEnabledFeishuToolsConfig(
  accounts: ResolvedFeishuAccount[],
): Required<FeishuToolsConfig> {
  const merged: Required<FeishuToolsConfig> = {
    doc: false,
    chat: false,
    wiki: false,
    drive: false,
    perm: false,
    scopes: false,
  };
  for (const account of accounts) {
    const cfg = resolveToolsConfig(account.config.tools);
    merged.doc = merged.doc || cfg.doc;
    merged.chat = merged.chat || cfg.chat;
    merged.wiki = merged.wiki || cfg.wiki;
    merged.drive = merged.drive || cfg.drive;
    merged.perm = merged.perm || cfg.perm;
    merged.scopes = merged.scopes || cfg.scopes;
  }
  return merged;
}
