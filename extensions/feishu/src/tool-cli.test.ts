import { Command } from "commander";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../src/config/config.js";
import { __testing } from "./tool-cli.js";

function makeConfig(): OpenClawConfig {
  return {
    agents: {
      defaults: {},
      list: [
        {
          id: "learning",
          workspace: "/tmp/workspace-learning",
        },
      ],
    },
    bindings: [
      {
        agentId: "learning",
        match: {
          channel: "feishu",
          accountId: "learning",
        },
      },
    ],
    channels: {
      feishu: {
        defaultAccount: "main",
        accounts: {
          learning: {
            enabled: true,
            appId: "cli_learning",
            appSecret: "secret_learning",
          },
          main: {
            enabled: true,
            appId: "cli_main",
          },
        },
      },
    },
  } as OpenClawConfig;
}

describe("resolveFeishuCliAccountId", () => {
  it("prefers explicit account id", () => {
    const resolved = __testing.resolveFeishuCliAccountId({
      cfg: makeConfig(),
      cwd: "/tmp/workspace-learning",
      explicitAccountId: "manual",
    });

    expect(resolved).toBe("manual");
  });

  it("prefers the bound account for the current agent workspace over defaultAccount", () => {
    const resolved = __testing.resolveFeishuCliAccountId({
      cfg: makeConfig(),
      cwd: "/tmp/workspace-learning/subdir",
    });

    expect(resolved).toBe("learning");
  });

  it("falls back to the only enabled configured account when no workspace binding matches", () => {
    const cfg = {
      channels: {
        feishu: {
          defaultAccount: "main",
          accounts: {
            learning: {
              enabled: true,
              appId: "cli_learning",
              appSecret: "secret_learning",
            },
            main: {
              enabled: true,
              appId: "cli_main",
            },
          },
        },
      },
    } as OpenClawConfig;

    const resolved = __testing.resolveFeishuCliAccountId({
      cfg,
      cwd: "/tmp/other-workspace",
    });

    expect(resolved).toBe("learning");
  });
});

describe("Feishu CLI fallback command coverage", () => {
  it("registers drive write subcommands so exec fallback can create and move folders/files", () => {
    const program = new Command();
    __testing.registerFeishuDriveCli(program, makeConfig());

    const drive = program.commands.find((command) => command.name() === "feishu_drive");
    expect(drive?.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["list", "info", "create_folder", "move", "delete", "copy"]),
    );
  });

  it("registers doc write subcommands so exec fallback can create and update documents", () => {
    const program = new Command();
    __testing.registerFeishuDocCli(program, makeConfig());

    const doc = program.commands.find((command) => command.name() === "feishu_doc");
    expect(doc?.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["read", "create", "write", "append", "upload_file"]),
    );
  });
});
