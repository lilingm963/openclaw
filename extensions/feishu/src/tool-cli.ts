import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { resolveAgentIdByWorkspacePath } from "../../../src/agents/agent-scope.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { buildChannelAccountBindings } from "../../../src/routing/bindings.js";
import { listEnabledFeishuAccounts } from "./accounts.js";
import { getBitableMeta, listFields, listRecords } from "./bitable.js";
import { readDoc } from "./docx.js";
import { getFileInfo, listFolder } from "./drive.js";
import { createFeishuToolContext } from "./tool-account.js";
import { getNode, listNodes, listSpaces } from "./wiki.js";

type CliIdentityOptions = {
  accountId?: string;
  userOpenId?: string;
};

type CliBitableListRecordsOptions = CliIdentityOptions & {
  pageSize?: string | number;
  pageToken?: string;
};

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalPositiveInt(
  value: string | number | undefined,
  label: string,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(typeof value === "string" ? value : String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function resolveBoundFeishuAccountId(cfg: OpenClawConfig, cwd: string): string | undefined {
  const agentId = resolveAgentIdByWorkspacePath(cfg, cwd);
  if (!agentId) {
    return undefined;
  }
  return buildChannelAccountBindings(cfg).get("feishu")?.get(agentId)?.[0];
}

function resolveFeishuCliAccountId(params: {
  cfg: OpenClawConfig;
  cwd?: string;
  explicitAccountId?: string;
}): string | undefined {
  const explicit = normalizeOptionalString(params.explicitAccountId);
  if (explicit) {
    return explicit;
  }
  const cwd = normalizeOptionalString(params.cwd) ?? process.cwd();
  const bound = resolveBoundFeishuAccountId(params.cfg, cwd);
  if (bound) {
    return bound;
  }
  const enabledAccounts = listEnabledFeishuAccounts(params.cfg);
  if (enabledAccounts.length === 1) {
    return enabledAccounts[0]?.accountId;
  }
  return undefined;
}

async function createCliContext(params: {
  config: OpenClawConfig;
  options?: CliIdentityOptions;
  cwd?: string;
}) {
  const accountId = resolveFeishuCliAccountId({
    cfg: params.config,
    cwd: params.cwd,
    explicitAccountId: params.options?.accountId,
  });
  return createFeishuToolContext({
    api: { config: params.config },
    executeParams: {
      accountId,
      userOpenId: normalizeOptionalString(params.options?.userOpenId),
    },
    defaultAccountId: accountId,
  });
}

async function runCliAction(action: () => Promise<unknown>) {
  try {
    printJson(await action());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
  }
}

function addIdentityOptions(command: Command): Command {
  return command
    .option("--account-id <id>", "Feishu account id override")
    .option("--user-open-id <openId>", "Requester Feishu open_id for user_access_token routing");
}

function registerFeishuWikiCli(program: Command, config: OpenClawConfig) {
  const wiki = program.command("feishu_wiki").description("Feishu wiki CLI fallback");

  addIdentityOptions(
    wiki.command("spaces").description("List accessible Feishu wiki spaces"),
  ).action(async (options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return listSpaces(ctx.client, ctx.requestOptions);
    }),
  );

  addIdentityOptions(
    wiki
      .command("nodes")
      .requiredOption("--space-id <id>", "Wiki space id")
      .option("--parent-node-token <token>", "Optional parent node token")
      .description("List wiki nodes in a space"),
  ).action(async (options: CliIdentityOptions & { spaceId: string; parentNodeToken?: string }) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return listNodes(
        ctx.client,
        options.spaceId,
        normalizeOptionalString(options.parentNodeToken),
        ctx.requestOptions,
      );
    }),
  );

  addIdentityOptions(
    wiki.command("get <token>").description("Get wiki node details by token"),
  ).action(async (token: string, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return getNode(ctx.client, token, ctx.requestOptions);
    }),
  );
}

function registerFeishuDocCli(program: Command, config: OpenClawConfig) {
  const doc = program.command("feishu_doc").description("Feishu doc CLI fallback");

  addIdentityOptions(
    doc.command("read <docToken>").description("Read a Feishu doc or wiki-backed doc"),
  ).action(async (docToken: string, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return readDoc(ctx.client, docToken, ctx.requestOptions);
    }),
  );
}

function registerFeishuDriveCli(program: Command, config: OpenClawConfig) {
  const drive = program.command("feishu_drive").description("Feishu drive CLI fallback");

  addIdentityOptions(
    drive.command("list [folderToken]").description("List a drive folder; defaults to root"),
  ).action(async (folderToken: string | undefined, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return listFolder(ctx.client, normalizeOptionalString(folderToken), ctx.requestOptions);
    }),
  );

  addIdentityOptions(
    drive.command("info <fileToken>").description("Get drive file metadata"),
  ).action(async (fileToken: string, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return getFileInfo(ctx.client, fileToken, undefined, ctx.requestOptions);
    }),
  );
}

function registerFeishuBitableCli(program: Command, config: OpenClawConfig) {
  addIdentityOptions(
    program
      .command("feishu_bitable_get_meta <url>")
      .description("Resolve a Feishu /base/ or /wiki/ bitable URL into app/table metadata"),
  ).action(async (url: string, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return getBitableMeta(ctx.client, url, ctx.requestOptions);
    }),
  );

  addIdentityOptions(
    program
      .command("feishu_bitable_list_fields <appToken> <tableId>")
      .description("List fields for a Feishu bitable table"),
  ).action(async (appToken: string, tableId: string, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return listFields(ctx.client, appToken, tableId, ctx.requestOptions);
    }),
  );

  addIdentityOptions(
    program
      .command("feishu_bitable_list_records <appToken> <tableId>")
      .option("--page-size <n>", "Page size")
      .option("--page-token <token>", "Pagination token")
      .description("List records for a Feishu bitable table"),
  ).action(async (appToken: string, tableId: string, options: CliBitableListRecordsOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return listRecords(
        ctx.client,
        appToken,
        tableId,
        parseOptionalPositiveInt(options.pageSize, "page-size"),
        normalizeOptionalString(options.pageToken),
        ctx.requestOptions,
      );
    }),
  );
}

export function registerFeishuToolCli(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program, config }) => {
      registerFeishuWikiCli(program, config);
      registerFeishuDocCli(program, config);
      registerFeishuDriveCli(program, config);
      registerFeishuBitableCli(program, config);
    },
    {
      commands: [
        "feishu_wiki",
        "feishu_doc",
        "feishu_drive",
        "feishu_bitable_get_meta",
        "feishu_bitable_list_fields",
        "feishu_bitable_list_records",
      ],
    },
  );
}

export const __testing = {
  resolveFeishuCliAccountId,
};
