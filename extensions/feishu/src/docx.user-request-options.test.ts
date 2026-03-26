import type { OpenClawPluginApi } from "openclaw/plugin-sdk/feishu";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { registerFeishuDocTools } from "./docx.js";
import { createToolFactoryHarness } from "./tool-factory-test-harness.js";

const docCreateMock = vi.fn();
const docConvertMock = vi.fn();
const docBlockListMock = vi.fn();
const docBlockDescendantCreateMock = vi.fn();
const permissionMemberCreateMock = vi.fn();
const withUserAccessTokenMock = vi.fn((token: string) => ({ auth: token }));
const getUserAccessTokenMock = vi.fn();

vi.mock("./client.js", () => ({
  createFeishuClient: () => ({
    docx: {
      document: {
        create: (...args: unknown[]) => docCreateMock(...args),
        convert: (...args: unknown[]) => docConvertMock(...args),
      },
      documentBlock: {
        list: (...args: unknown[]) => docBlockListMock(...args),
      },
      documentBlockDescendant: {
        create: (...args: unknown[]) => docBlockDescendantCreateMock(...args),
      },
    },
    drive: {
      permissionMember: {
        create: (...args: unknown[]) => permissionMemberCreateMock(...args),
      },
    },
  }),
}));

vi.mock("./oauth.js", () => ({
  getUserAccessToken: (...args: unknown[]) => getUserAccessTokenMock(...args),
}));

vi.mock("@larksuiteoapi/node-sdk", () => ({
  default: {},
  withUserAccessToken: (...args: [string]) => withUserAccessTokenMock(...args),
}));

function createDocEnabledConfig(): OpenClawPluginApi["config"] {
  return {
    channels: {
      feishu: {
        enabled: true,
        accounts: {
          learning: {
            appId: "app-learning",
            appSecret: "sec-learning", // pragma: allowlist secret
            tools: { doc: true },
          },
        },
      },
    },
  } as OpenClawPluginApi["config"];
}

describe("feishu_doc user request options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserAccessTokenMock.mockResolvedValue("user-token");
    docCreateMock.mockResolvedValue({
      code: 0,
      data: { document: { document_id: "doc_new", title: "Smoke" } },
    });
    docConvertMock.mockResolvedValue({
      code: 0,
      data: {
        blocks: [{ block_id: "blk_1", block_type: 2, children: [] }],
        first_level_block_ids: ["blk_1"],
      },
    });
    docBlockListMock.mockResolvedValue({
      code: 0,
      data: { items: [] },
    });
    docBlockDescendantCreateMock.mockResolvedValue({
      code: 0,
      data: { children: [{ block_id: "blk_1" }] },
    });
    permissionMemberCreateMock.mockResolvedValue({ code: 0 });
  });

  test("passes user request options to document creation calls", async () => {
    const { api, resolveTool } = createToolFactoryHarness(createDocEnabledConfig());
    registerFeishuDocTools(api);

    const tool = resolveTool("feishu_doc", {
      agentAccountId: "learning",
      messageChannel: "feishu",
      requesterSenderId: "ou_123",
    });

    await tool.execute("call-create", {
      action: "create",
      title: "Smoke",
    });

    expect(withUserAccessTokenMock).toHaveBeenCalledWith("user-token");
    const requestOptions = { auth: "user-token" };
    expect(docCreateMock).toHaveBeenCalledWith(expect.anything(), requestOptions);
    expect(permissionMemberCreateMock).not.toHaveBeenCalled();
  });

  test("passes user request options through markdown write operations", async () => {
    const { api, resolveTool } = createToolFactoryHarness(createDocEnabledConfig());
    registerFeishuDocTools(api);

    const tool = resolveTool("feishu_doc", {
      agentAccountId: "learning",
      messageChannel: "feishu",
      requesterSenderId: "ou_123",
    });

    await tool.execute("call-write", {
      action: "write",
      doc_token: "doc_existing",
      content: "# Smoke",
    });

    const requestOptions = { auth: "user-token" };
    expect(docBlockListMock).toHaveBeenCalledWith(expect.anything(), requestOptions);
    expect(docConvertMock).toHaveBeenCalledWith(expect.anything(), requestOptions);
    expect(docBlockDescendantCreateMock).toHaveBeenCalledWith(expect.anything(), requestOptions);
  });
});
