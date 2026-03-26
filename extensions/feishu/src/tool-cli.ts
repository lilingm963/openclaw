import { promises as fs } from "node:fs";
import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { resolveAgentIdByWorkspacePath } from "../../../src/agents/agent-scope.js";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { buildChannelAccountBindings } from "../../../src/routing/bindings.js";
import { listEnabledFeishuAccounts } from "./accounts.js";
import { getBitableMeta, listFields, listRecords } from "./bitable.js";
import { appendDoc, createDoc, readDoc, uploadFileBlock, writeDoc } from "./docx.js";
import { copyFile, createFolder, deleteFile, getFileInfo, listFolder, moveFile } from "./drive.js";
import { createFeishuToolContext, resolveFeishuToolAccount } from "./tool-account.js";
import { getNode, listNodes, listSpaces } from "./wiki.js";

type CliIdentityOptions = {
  accountId?: string;
  userOpenId?: string;
};

type CliBitableListRecordsOptions = CliIdentityOptions & {
  pageSize?: string | number;
  pageToken?: string;
};

type CliContentOptions = {
  content?: string;
  contentFile?: string;
};

type CliDriveMutationOptions = CliIdentityOptions & {
  type?: string;
  name?: string;
};

type CliDocMutationOptions = CliIdentityOptions & CliContentOptions;

type CliDocUploadFileOptions = CliIdentityOptions & {
  url?: string;
  filePath?: string;
  filename?: string;
  parentBlockId?: string;
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
  const toolContext = await createFeishuToolContext({
    api: { config: params.config },
    executeParams: {
      accountId,
      userOpenId: normalizeOptionalString(params.options?.userOpenId),
    },
    defaultAccountId: accountId,
  });
  return { ...toolContext, accountId };
}

function getCliMediaMaxBytes(config: OpenClawConfig, accountId?: string): number {
  const resolved = resolveFeishuToolAccount({
    api: { config },
    executeParams: accountId ? { accountId } : undefined,
    defaultAccountId: accountId,
  });
  return (resolved.config.mediaMaxMb ?? 30) * 1024 * 1024;
}

async function resolveCliContent(options: CliContentOptions): Promise<string> {
  const inlineContent = options.content;
  const filePath = normalizeOptionalString(options.contentFile);
  if (inlineContent && filePath) {
    throw new Error("Provide only one of --content or --content-file");
  }
  if (typeof inlineContent === "string") {
    return inlineContent;
  }
  if (filePath) {
    return fs.readFile(filePath, "utf8");
  }
  throw new Error("One of --content or --content-file is required");
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

  addIdentityOptions(
    doc
      .command("create <title> [folderToken]")
      .description("Create a Feishu doc, optionally inside a drive folder"),
  ).action(async (title: string, folderToken: string | undefined, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return createDoc(
        ctx.client,
        title,
        normalizeOptionalString(folderToken),
        { requesterOpenId: normalizeOptionalString(options.userOpenId) },
        ctx.requestOptions,
      );
    }),
  );

  addIdentityOptions(
    doc
      .command("write <docToken>")
      .option("--content <markdown>", "Markdown content")
      .option("--content-file <path>", "Read markdown content from a UTF-8 file")
      .description("Replace a Feishu doc with markdown content"),
  ).action(async (docToken: string, options: CliDocMutationOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      const content = await resolveCliContent(options);
      return writeDoc(
        ctx.client,
        docToken,
        content,
        getCliMediaMaxBytes(config, ctx.accountId),
        undefined,
        ctx.requestOptions,
      );
    }),
  );

  addIdentityOptions(
    doc
      .command("append <docToken>")
      .option("--content <markdown>", "Markdown content")
      .option("--content-file <path>", "Read markdown content from a UTF-8 file")
      .description("Append markdown content to a Feishu doc"),
  ).action(async (docToken: string, options: CliDocMutationOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      const content = await resolveCliContent(options);
      return appendDoc(
        ctx.client,
        docToken,
        content,
        getCliMediaMaxBytes(config, ctx.accountId),
        undefined,
        ctx.requestOptions,
      );
    }),
  );

  addIdentityOptions(
    doc
      .command("upload_file <docToken>")
      .option("--url <url>", "Remote file URL to fetch and upload")
      .option("--file-path <path>", "Local file path to upload")
      .option("--filename <name>", "Optional filename override")
      .option("--parent-block-id <id>", "Optional parent block for placement")
      .description("Upload a file for a Feishu doc workflow"),
  ).action(async (docToken: string, options: CliDocUploadFileOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return uploadFileBlock(
        ctx.client,
        docToken,
        getCliMediaMaxBytes(config, ctx.accountId),
        normalizeOptionalString(options.url),
        normalizeOptionalString(options.filePath),
        normalizeOptionalString(options.parentBlockId),
        normalizeOptionalString(options.filename),
        ctx.requestOptions,
      );
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

  addIdentityOptions(
    drive
      .command("create_folder <name> [folderToken]")
      .description("Create a drive folder, optionally inside a parent folder"),
  ).action(async (name: string, folderToken: string | undefined, options: CliIdentityOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return createFolder(
        ctx.client,
        name,
        normalizeOptionalString(folderToken),
        ctx.requestOptions,
      );
    }),
  );

  addIdentityOptions(
    drive
      .command("move <fileToken> <folderToken>")
      .requiredOption("--type <type>", "Drive file type")
      .description("Move a drive file into a folder"),
  ).action(async (fileToken: string, folderToken: string, options: CliDriveMutationOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return moveFile(
        ctx.client,
        fileToken,
        normalizeOptionalString(options.type) ?? "docx",
        folderToken,
        ctx.requestOptions,
      );
    }),
  );

  addIdentityOptions(
    drive
      .command("delete <fileToken>")
      .requiredOption("--type <type>", "Drive file type")
      .description("Delete a drive file"),
  ).action(async (fileToken: string, options: CliDriveMutationOptions) =>
    runCliAction(async () => {
      const ctx = await createCliContext({ config, options });
      return deleteFile(
        ctx.client,
        fileToken,
        normalizeOptionalString(options.type) ?? "docx",
        ctx.requestOptions,
      );
    }),
  );

  addIdentityOptions(
    drive
      .command("copy <fileToken> [folderToken]")
      .requiredOption("--type <type>", "Drive file type")
      .option("--name <name>", "Optional copied file name")
      .description("Copy a drive file"),
  ).action(
    async (fileToken: string, folderToken: string | undefined, options: CliDriveMutationOptions) =>
      runCliAction(async () => {
        const ctx = await createCliContext({ config, options });
        return copyFile(
          ctx.client,
          fileToken,
          normalizeOptionalString(options.type) ?? "docx",
          normalizeOptionalString(options.name),
          normalizeOptionalString(folderToken),
          ctx.requestOptions,
        );
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
  registerFeishuDocCli,
  registerFeishuDriveCli,
};
