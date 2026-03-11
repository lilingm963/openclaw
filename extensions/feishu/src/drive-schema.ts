import { Type, type Static } from "@sinclair/typebox";

const UserOpenId = Type.Optional(
  Type.String({
    description: "Feishu user open_id for user-identity API calls (uses OAuth user_access_token)",
  }),
);

const FileType = Type.Union([
  Type.Literal("doc"),
  Type.Literal("docx"),
  Type.Literal("sheet"),
  Type.Literal("bitable"),
  Type.Literal("folder"),
  Type.Literal("file"),
  Type.Literal("mindnote"),
  Type.Literal("shortcut"),
]);

export const FeishuDriveSchema = Type.Union([
  Type.Object({
    action: Type.Literal("list"),
    folder_token: Type.Optional(
      Type.String({ description: "Folder token (optional, omit for root directory)" }),
    ),
    userOpenId: UserOpenId,
  }),
  Type.Object({
    action: Type.Literal("info"),
    file_token: Type.String({ description: "File or folder token" }),
    type: FileType,
    userOpenId: UserOpenId,
  }),
  Type.Object({
    action: Type.Literal("create_folder"),
    name: Type.String({ description: "Folder name" }),
    folder_token: Type.Optional(
      Type.String({ description: "Parent folder token (optional, omit for root)" }),
    ),
    userOpenId: UserOpenId,
  }),
  Type.Object({
    action: Type.Literal("move"),
    file_token: Type.String({ description: "File token to move" }),
    type: FileType,
    folder_token: Type.String({ description: "Target folder token" }),
    userOpenId: UserOpenId,
  }),
  Type.Object({
    action: Type.Literal("delete"),
    file_token: Type.String({ description: "File token to delete" }),
    type: FileType,
    userOpenId: UserOpenId,
  }),
  Type.Object({
    action: Type.Literal("copy"),
    file_token: Type.String({ description: "File token to copy" }),
    type: FileType,
    name: Type.Optional(Type.String({ description: "New file name (optional)" })),
    folder_token: Type.Optional(
      Type.String({ description: "Target folder token (optional, omit for same folder)" }),
    ),
    userOpenId: UserOpenId,
  }),
]);

export type FeishuDriveParams = Static<typeof FeishuDriveSchema>;
