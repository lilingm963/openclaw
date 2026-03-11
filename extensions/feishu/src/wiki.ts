import type * as Lark from "@larksuiteoapi/node-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { listEnabledFeishuAccounts } from "./accounts.js";
import {
  createFeishuToolContext,
  resolveAnyEnabledFeishuToolsConfig,
  resolveFeishuToolAccount,
} from "./tool-account.js";
import {
  jsonToolResult,
  toolExecutionErrorResult,
  unknownToolActionResult,
} from "./tool-result.js";
import { FeishuWikiSchema, type FeishuWikiParams } from "./wiki-schema.js";

type ObjType = "doc" | "sheet" | "mindnote" | "bitable" | "file" | "docx" | "slides";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK IRequestOptions uses opaque symbol keys
type RequestOptions = any;

// ============ Actions ============

const WIKI_ACCESS_HINT =
  "To grant wiki access: Open wiki space → Settings → Members → Add the bot. " +
  "See: https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-qa#a40ad4ca";

export async function listSpaces(client: Lark.Client, options?: RequestOptions) {
  const res = await client.wiki.space.list({}, options);
  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  const spaces =
    res.data?.items?.map((s) => ({
      space_id: s.space_id,
      name: s.name,
      description: s.description,
      visibility: s.visibility,
    })) ?? [];

  return {
    spaces,
    ...(spaces.length === 0 && { hint: WIKI_ACCESS_HINT }),
  };
}

export async function listNodes(
  client: Lark.Client,
  spaceId: string,
  parentNodeToken?: string,
  options?: RequestOptions,
) {
  const res = await client.wiki.spaceNode.list(
    {
      path: { space_id: spaceId },
      params: { parent_node_token: parentNodeToken },
    },
    options,
  );
  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  return {
    nodes:
      res.data?.items?.map((n) => ({
        node_token: n.node_token,
        obj_token: n.obj_token,
        obj_type: n.obj_type,
        title: n.title,
        has_child: n.has_child,
      })) ?? [],
  };
}

export async function getNode(client: Lark.Client, token: string, options?: RequestOptions) {
  const res = await client.wiki.space.getNode(
    {
      params: { token },
    },
    options,
  );
  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  const node = res.data?.node;
  return {
    node_token: node?.node_token,
    space_id: node?.space_id,
    obj_token: node?.obj_token,
    obj_type: node?.obj_type,
    title: node?.title,
    parent_node_token: node?.parent_node_token,
    has_child: node?.has_child,
    creator: node?.creator,
    create_time: node?.node_create_time,
  };
}

async function createNode(
  client: Lark.Client,
  spaceId: string,
  title: string,
  objType?: string,
  parentNodeToken?: string,
  options?: RequestOptions,
) {
  const res = await client.wiki.spaceNode.create(
    {
      path: { space_id: spaceId },
      data: {
        obj_type: (objType as ObjType) || "docx",
        node_type: "origin" as const,
        title,
        parent_node_token: parentNodeToken,
      },
    },
    options,
  );
  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  const node = res.data?.node;
  return {
    node_token: node?.node_token,
    obj_token: node?.obj_token,
    obj_type: node?.obj_type,
    title: node?.title,
  };
}

async function moveNode(
  client: Lark.Client,
  spaceId: string,
  nodeToken: string,
  targetSpaceId?: string,
  targetParentToken?: string,
  options?: RequestOptions,
) {
  const res = await client.wiki.spaceNode.move(
    {
      path: { space_id: spaceId, node_token: nodeToken },
      data: {
        target_space_id: targetSpaceId || spaceId,
        target_parent_token: targetParentToken,
      },
    },
    options,
  );
  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  return {
    success: true,
    node_token: res.data?.node?.node_token,
  };
}

async function renameNode(
  client: Lark.Client,
  spaceId: string,
  nodeToken: string,
  title: string,
  options?: RequestOptions,
) {
  const res = await client.wiki.spaceNode.updateTitle(
    {
      path: { space_id: spaceId, node_token: nodeToken },
      data: { title },
    },
    options,
  );
  if (res.code !== 0) {
    throw new Error(res.msg);
  }

  return {
    success: true,
    node_token: nodeToken,
    title,
  };
}

// ============ Tool Registration ============

export function registerFeishuWikiTools(api: OpenClawPluginApi) {
  if (!api.config) {
    api.logger.debug?.("feishu_wiki: No config available, skipping wiki tools");
    return;
  }

  const accounts = listEnabledFeishuAccounts(api.config);
  if (accounts.length === 0) {
    api.logger.debug?.("feishu_wiki: No Feishu accounts configured, skipping wiki tools");
    return;
  }

  const toolsCfg = resolveAnyEnabledFeishuToolsConfig(accounts);
  if (!toolsCfg.wiki) {
    api.logger.debug?.("feishu_wiki: wiki tool disabled in config");
    return;
  }

  type FeishuWikiExecuteParams = FeishuWikiParams & { accountId?: string; userOpenId?: string };

  api.registerTool(
    (ctx) => {
      const defaultAccountId = ctx.agentAccountId;
      const trustedRequesterOpenId =
        ctx.messageChannel === "feishu" ? ctx.requesterSenderId?.trim() || undefined : undefined;
      return {
        name: "feishu_wiki",
        label: "Feishu Wiki",
        description:
          "Feishu knowledge base operations. Actions: spaces, nodes, get, create, move, rename",
        parameters: FeishuWikiSchema,
        async execute(_toolCallId, params) {
          const p = params as FeishuWikiExecuteParams;
          try {
            const resolvedAccount = resolveFeishuToolAccount({
              api,
              executeParams: p,
              defaultAccountId,
            });
            const ctx = await createFeishuToolContext({
              api,
              executeParams: p,
              defaultAccountId,
              trustedRequesterOpenId,
            });
            const opts = ctx.requestOptions;
            switch (p.action) {
              case "spaces":
                return jsonToolResult(await listSpaces(ctx.client, opts));
              case "nodes":
                return jsonToolResult(
                  await listNodes(ctx.client, p.space_id, p.parent_node_token, opts),
                );
              case "get":
                return jsonToolResult(await getNode(ctx.client, p.token, opts));
              case "search":
                return jsonToolResult({
                  error:
                    "Search is not available. Use feishu_wiki with action: 'nodes' to browse or action: 'get' to lookup by token.",
                });
              case "create":
                return jsonToolResult(
                  await createNode(
                    ctx.client,
                    p.space_id,
                    p.title,
                    p.obj_type,
                    p.parent_node_token,
                    opts,
                  ),
                );
              case "move":
                return jsonToolResult(
                  await moveNode(
                    ctx.client,
                    p.space_id,
                    p.node_token,
                    p.target_space_id,
                    p.target_parent_token,
                    opts,
                  ),
                );
              case "rename":
                return jsonToolResult(
                  await renameNode(ctx.client, p.space_id, p.node_token, p.title, opts),
                );
              default:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exhaustive check fallback
                return unknownToolActionResult((p as { action?: unknown }).action);
            }
          } catch (err) {
            return toolExecutionErrorResult(err);
          }
        },
      };
    },
    { name: "feishu_wiki" },
  );

  api.logger.info?.(`feishu_wiki: Registered feishu_wiki tool`);
}
