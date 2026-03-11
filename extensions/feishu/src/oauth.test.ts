import { describe, expect, it } from "vitest";
import {
  buildAuthorizationUrl,
  DEFAULT_FEISHU_OAUTH_SCOPES,
  resolveAuthorizationScopes,
} from "./oauth.js";

describe("Feishu OAuth authorization scopes", () => {
  it("applies the default document scopes when none are configured", () => {
    const url = new URL(
      buildAuthorizationUrl({
        appId: "cli_default",
        domain: "feishu",
        redirectUri: "https://open.feishu.cn/open-apis/authen/v1/index",
      }),
    );

    expect(url.searchParams.get("scope")).toBe(DEFAULT_FEISHU_OAUTH_SCOPES.join(" "));
    expect(resolveAuthorizationScopes()).toEqual([...DEFAULT_FEISHU_OAUTH_SCOPES]);
  });

  it("normalizes configured scopes before encoding them into the authorization URL", () => {
    const url = new URL(
      buildAuthorizationUrl({
        appId: "cli_custom",
        domain: "feishu",
        redirectUri: "https://open.feishu.cn/open-apis/authen/v1/index",
        scopes: [" drive:drive ", "wiki:wiki", "", "drive:drive", "bitable:app"],
      }),
    );

    expect(url.searchParams.get("scope")).toBe("drive:drive wiki:wiki bitable:app");
  });
});
