import type * as Lark from "@larksuiteoapi/node-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { listEnabledFeishuAccounts } from "./accounts.js";
import { FeishuChatSchema, type FeishuChatParams } from "./chat-schema.js";
import { createFeishuToolContext } from "./tool-account.js";
import { resolveToolsConfig } from "./tools-config.js";
function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK IRequestOptions uses opaque symbol keys
type RequestOptions = any;

async function getChatInfo(client: Lark.Client, chatId: string, options?: RequestOptions) {
  const res = await client.im.chat.get({ path: { chat_id: chatId } }, options);
  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  const chat = res.data;
  return {
    chat_id: chatId,
    name: chat?.name,
    description: chat?.description,
    owner_id: chat?.owner_id,
    tenant_key: chat?.tenant_key,
    user_count: chat?.user_count,
    chat_mode: chat?.chat_mode,
    chat_type: chat?.chat_type,
    join_message_visibility: chat?.join_message_visibility,
    leave_message_visibility: chat?.leave_message_visibility,
    membership_approval: chat?.membership_approval,
    moderation_permission: chat?.moderation_permission,
    avatar: chat?.avatar,
  };
}

async function getChatMembers(
  client: Lark.Client,
  chatId: string,
  pageSize?: number,
  pageToken?: string,
  memberIdType?: "open_id" | "user_id" | "union_id",
  options?: RequestOptions,
) {
  const page_size = pageSize ? Math.max(1, Math.min(100, pageSize)) : 50;
  const res = await client.im.chatMembers.get(
    {
      path: { chat_id: chatId },
      params: {
        page_size,
        page_token: pageToken,
        member_id_type: memberIdType ?? "open_id",
      },
    },
    options,
  );

  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  return {
    chat_id: chatId,
    has_more: res.data?.has_more,
    page_token: res.data?.page_token,
    members:
      res.data?.items?.map((item) => ({
        member_id: item.member_id,
        name: item.name,
        tenant_key: item.tenant_key,
        member_id_type: item.member_id_type,
      })) ?? [],
  };
}

export function registerFeishuChatTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("feishu_chat: No config available, skipping chat tools");
    return;
  }

  const accounts = listEnabledFeishuAccounts(api.config);
  if (accounts.length === 0) {
    api.logger.debug?.("feishu_chat: No Feishu accounts configured, skipping chat tools");
    return;
  }

  const firstAccount = accounts[0];
  const toolsCfg = resolveToolsConfig(firstAccount.config.tools);
  if (!toolsCfg.chat) {
    api.logger.debug?.("feishu_chat: chat tool disabled in config");
    return;
  }

  type FeishuChatExecuteParams = FeishuChatParams & { userOpenId?: string };

  api.registerTool(
    (ctx) => {
      const trustedRequesterOpenId =
        ctx.messageChannel === "feishu" ? ctx.requesterSenderId?.trim() || undefined : undefined;
      return {
        name: "feishu_chat",
        label: "Feishu Chat",
        description: "Feishu chat operations. Actions: members, info",
        parameters: FeishuChatSchema,
        async execute(_toolCallId, params) {
          const p = params as FeishuChatExecuteParams;
          try {
            const ctx = await createFeishuToolContext({
              api,
              executeParams: p,
              trustedRequesterOpenId,
            });
            const opts = ctx.requestOptions;
            switch (p.action) {
              case "members":
                return json(
                  await getChatMembers(
                    ctx.client,
                    p.chat_id,
                    p.page_size,
                    p.page_token,
                    p.member_id_type,
                    opts,
                  ),
                );
              case "info":
                return json(await getChatInfo(ctx.client, p.chat_id, opts));
              default:
                return json({ error: `Unknown action: ${String(p.action)}` });
            }
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      };
    },
    { name: "feishu_chat" },
  );

  api.logger.info?.("feishu_chat: Registered feishu_chat tool");
}
