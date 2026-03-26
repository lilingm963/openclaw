import { describe, expect, test, vi } from "vitest";
import { createFolder } from "./drive.js";

describe("feishu_drive root folder resolution", () => {
  test("uses formatted request headers when resolving the user root folder token", async () => {
    const formatPayloadMock = vi.fn(async () => ({
      headers: { Authorization: "Bearer user-token" },
    }));
    const httpGetMock = vi.fn(async () => ({
      code: 0,
      data: { token: "root_token" },
    }));
    const createFolderMock = vi.fn(async () => ({
      code: 0,
      data: { token: "folder_token", url: "https://example.test/folder_token" },
    }));

    const client = {
      domain: "https://open.feishu.cn",
      formatPayload: formatPayloadMock,
      httpInstance: {
        get: httpGetMock,
      },
      drive: {
        file: {
          createFolder: createFolderMock,
        },
      },
    };

    const requestOptions = { lark: { auth: "ignored" } };
    const result = await createFolder(client as never, "Smoke", undefined, requestOptions as never);

    expect(formatPayloadMock).toHaveBeenCalledWith(undefined, requestOptions);
    expect(httpGetMock).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/drive/explorer/v2/root_folder/meta",
      {
        headers: { Authorization: "Bearer user-token" },
      },
    );
    expect(createFolderMock).toHaveBeenCalledWith(
      {
        data: {
          name: "Smoke",
          folder_token: "root_token",
        },
      },
      requestOptions,
    );
    expect(result).toEqual({
      token: "folder_token",
      url: "https://example.test/folder_token",
    });
  });
});
