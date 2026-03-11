import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { afterEach, describe, expect, it, vi } from "vitest";

const createFeishuClientMock = vi.hoisted(() => vi.fn(() => ({ client: "feishu" })));
const exchangeCodeForTokenMock = vi.hoisted(() => vi.fn());
const storeTokenMock = vi.hoisted(() => vi.fn());

vi.mock("./client.js", () => ({
  createFeishuClient: createFeishuClientMock,
}));

vi.mock("./oauth-store.js", () => ({
  storeToken: storeTokenMock,
}));

vi.mock("./oauth.js", async () => {
  const actual = await vi.importActual<typeof import("./oauth.js")>("./oauth.js");
  return {
    ...actual,
    exchangeCodeForToken: exchangeCodeForTokenMock,
  };
});

import { registerFeishuAuthCommand } from "./auth-command.js";

type RegisteredCommand = Parameters<OpenClawPluginApi["registerCommand"]>[0];

function createConfig(): OpenClawPluginApi["config"] {
  return {
    channels: {
      feishu: {
        accounts: {
          main: {
            appId: "cli_main",
            appSecret: "secret_main", // pragma: allowlist secret
          },
        },
      },
    },
  } as OpenClawPluginApi["config"];
}

function createApiHarness() {
  let registeredCommand: RegisteredCommand | undefined;
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const api = {
    logger,
    registerCommand: (command: RegisteredCommand) => {
      registeredCommand = command;
    },
  } as unknown as OpenClawPluginApi;

  registerFeishuAuthCommand(api);

  if (!registeredCommand) {
    throw new Error("feishu-auth command was not registered");
  }

  return { command: registeredCommand, logger };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("feishu-auth command", () => {
  it("uses the default OAuth scopes in the generated authorization URL", async () => {
    const { command } = createApiHarness();

    const result = await command.handler({
      channel: "feishu",
      isAuthorizedSender: true,
      commandBody: "/feishu-auth",
      config: createConfig(),
      accountId: "main",
    });

    const urlMatch = result.text?.match(/https:\/\/\S+/);
    expect(urlMatch?.[0]).toBeTruthy();

    const url = new URL(urlMatch![0]);
    expect(url.searchParams.get("scope")).toBe("drive:drive wiki:wiki docx:document bitable:app");
    expect(result.text).toContain(
      "默认请求 scope: drive:drive wiki:wiki docx:document bitable:app",
    );
  });

  it("shows requested, granted, and missing scopes after token exchange", async () => {
    exchangeCodeForTokenMock.mockResolvedValue({
      accessToken: "u-123",
      refreshToken: "r-123",
      expiresAt: Date.now() + 60 * 60 * 1000,
      scope: "drive:drive wiki:wiki docx:document",
    });

    const { command, logger } = createApiHarness();
    const result = await command.handler({
      channel: "feishu",
      isAuthorizedSender: true,
      commandBody: "/feishu-auth code_123",
      args: "code_123",
      config: createConfig(),
      accountId: "main",
      from: "feishu:ou_user_123",
    });

    expect(createFeishuClientMock).toHaveBeenCalled();
    expect(storeTokenMock).toHaveBeenCalledWith(
      "main",
      "ou_user_123",
      expect.objectContaining({
        accessToken: "u-123",
        refreshToken: "r-123",
        scope: "drive:drive wiki:wiki docx:document",
      }),
    );
    expect(result.text).toContain("请求 scope: drive:drive wiki:wiki docx:document bitable:app");
    expect(result.text).toContain("返回 scope: drive:drive wiki:wiki docx:document");
    expect(result.text).toContain("⚠️ 缺失 scope: bitable:app");
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("missing=[bitable:app]"));
  });
});
