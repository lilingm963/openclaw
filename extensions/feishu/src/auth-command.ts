import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { createFeishuClient } from "./client.js";
import { storeToken } from "./oauth-store.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  resolveAuthorizationScopes,
} from "./oauth.js";
import { resolveFeishuToolAccount } from "./tool-account.js";

/**
 * Register the `/feishu-auth` command.
 *
 * Usage:
 *   /feishu-auth          — Generate an OAuth authorization URL
 *   /feishu-auth <code>   — Exchange an authorization code for user_access_token
 */
export function registerFeishuAuthCommand(api: OpenClawPluginApi): void {
  api.registerCommand({
    name: "feishu-auth",
    description: "Authorize Feishu user identity (OAuth user_access_token)",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const code = ctx.args?.trim();
      const account = resolveFeishuToolAccount({
        api: { config: ctx.config },
        defaultAccountId: ctx.accountId,
      });

      if (!account.appId) {
        return { text: "Feishu appId not configured." };
      }

      const redirectUri =
        account.oauth?.redirectUri ?? "https://open.feishu.cn/open-apis/authen/v1/index";
      const requestedScopes = resolveAuthorizationScopes(account.oauth?.scopes);

      // No code provided — generate the authorization URL
      if (!code) {
        const url = buildAuthorizationUrl({
          appId: account.appId,
          domain: account.domain,
          redirectUri,
          scopes: requestedScopes,
          state: account.accountId,
        });
        return {
          text:
            `请在浏览器中打开以下链接完成授权：\n\n${url}\n\n` +
            `默认请求 scope: ${requestedScopes.join(" ")}\n\n` +
            `授权完成后，你会被重定向到回调页面，URL 中包含 \`code\` 参数。\n` +
            `复制 code 值，然后发送：\n/feishu-auth <code>`,
        };
      }

      // Code provided — exchange for tokens
      const senderOpenId = extractOpenId(ctx.from);
      if (!senderOpenId) {
        return { text: "无法识别你的飞书用户 ID，请在飞书中发送此命令。" };
      }

      try {
        const client = createFeishuClient(account);
        const result = await exchangeCodeForToken(client, code);
        const grantedScopes = parseScopeList(result.scope);
        const missingScopes = requestedScopes.filter((scope) => !grantedScopes.includes(scope));

        await storeToken(account.accountId, senderOpenId, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
          scope: result.scope,
        });

        api.logger.info?.(
          `feishu-auth: account=${account.accountId} user=${senderOpenId} requested=[${requestedScopes.join(", ")}] granted=[${grantedScopes.join(", ")}] missing=[${missingScopes.join(", ")}]`,
        );

        return {
          text:
            `✅ 授权成功！\n\n` +
            `账户: ${account.accountId}\n` +
            `用户: ${senderOpenId}\n` +
            `请求 scope: ${requestedScopes.join(" ")}\n` +
            `返回 scope: ${formatScopeList(grantedScopes, result.scope)}\n` +
            (missingScopes.length > 0 ? `⚠️ 缺失 scope: ${missingScopes.join(" ")}\n` : "") +
            `有效期: ${Math.round((result.expiresAt - Date.now()) / 60_000)} 分钟（到期自动刷新）\n\n` +
            `现在可以使用用户身份访问飞书文档、云空间等 API 了。`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `❌ 授权失败: ${msg}` };
      }
    },
  });
}

/**
 * Extract the open_id from the `from` field.
 * Format is typically `feishu:<open_id>` or just the open_id.
 */
function extractOpenId(from: string | undefined): string | undefined {
  if (!from) return undefined;
  const trimmed = from.trim();
  if (trimmed.startsWith("feishu:")) {
    return trimmed.slice("feishu:".length);
  }
  return trimmed;
}

function parseScopeList(scope: string | undefined): string[] {
  const normalized = scope
    ?.split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return normalized ? Array.from(new Set(normalized)) : [];
}

function formatScopeList(scopes: string[], rawScope: string | undefined): string {
  if (scopes.length > 0) {
    return scopes.join(" ");
  }
  return rawScope?.trim() || "(empty)";
}
