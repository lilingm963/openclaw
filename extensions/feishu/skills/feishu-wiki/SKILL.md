---
name: feishu-wiki
description: |
  Feishu knowledge base navigation. Activate when user mentions knowledge base, wiki, or wiki links.
---

# Feishu Wiki Tool

Single tool `feishu_wiki` for knowledge base operations.

## User Identity First

- If the incoming Feishu message includes `sender_id`, `sender`, or `id` in metadata, treat that value as the requesting user's `open_id`.
- For user-owned wiki/doc/base content, always pass that value as `userOpenId` in `feishu_wiki` and any follow-up `feishu_doc` / `feishu_bitable_*` calls.
- Do not claim the tool is unavailable or that you lack access before making the actual tool call. If `feishu_wiki` is in the available tools list, call it directly.

## CLI Fallback

- If `feishu_wiki` is missing from the available tools list but `exec` is available, do not ask the user to paste content.
- Use CLI fallback from the current workspace instead:

```bash
openclaw feishu_wiki get ABC123def --user-open-id ou_xxx
```

- If the returned `obj_type` is `docx`, continue with:

```bash
openclaw feishu_doc read obj_token --user-open-id ou_xxx
```

- If the returned `obj_type` is `bitable`, continue with:

```bash
openclaw feishu_bitable_get_meta 'https://my.feishu.cn/wiki/ABC123def'
```

- The CLI fallback auto-resolves the bound Feishu account from the current agent workspace, so you do not need to ask the user for account ids in normal `learning` sessions.

## Token Extraction

From URL `https://xxx.feishu.cn/wiki/ABC123def` → `token` = `ABC123def`

## Actions

### List Knowledge Spaces

```json
{ "action": "spaces" }
```

Returns all accessible wiki spaces.

### List Nodes

```json
{ "action": "nodes", "space_id": "7xxx" }
```

With parent:

```json
{ "action": "nodes", "space_id": "7xxx", "parent_node_token": "wikcnXXX" }
```

### Get Node Details

```json
{ "action": "get", "token": "ABC123def", "userOpenId": "ou_xxx" }
```

Returns: `node_token`, `obj_token`, `obj_type`, etc. Use `obj_token` with `feishu_doc` to read/write the document.

### Create Node

```json
{ "action": "create", "space_id": "7xxx", "title": "New Page" }
```

With type and parent:

```json
{
  "action": "create",
  "space_id": "7xxx",
  "title": "Sheet",
  "obj_type": "sheet",
  "parent_node_token": "wikcnXXX"
}
```

`obj_type`: `docx` (default), `sheet`, `bitable`, `mindnote`, `file`, `doc`, `slides`

### Move Node

```json
{ "action": "move", "space_id": "7xxx", "node_token": "wikcnXXX" }
```

To different location:

```json
{
  "action": "move",
  "space_id": "7xxx",
  "node_token": "wikcnXXX",
  "target_space_id": "7yyy",
  "target_parent_token": "wikcnYYY"
}
```

### Rename Node

```json
{ "action": "rename", "space_id": "7xxx", "node_token": "wikcnXXX", "title": "New Title" }
```

## Wiki-Doc Workflow

To edit a wiki page:

1. Get node: `{ "action": "get", "token": "wiki_token", "userOpenId": "ou_xxx" }` → returns `obj_token`
2. Read doc: `feishu_doc { "action": "read", "doc_token": "obj_token", "userOpenId": "ou_xxx" }`
3. Write doc: `feishu_doc { "action": "write", "doc_token": "obj_token", "content": "...", "userOpenId": "ou_xxx" }`

## Configuration

```yaml
channels:
  feishu:
    tools:
      wiki: true # default: true
      doc: true # required - wiki content uses feishu_doc
```

**Dependency:** This tool requires `feishu_doc` to be enabled. Wiki pages are documents - use `feishu_wiki` to navigate, then `feishu_doc` to read/edit content.

## Permissions

Required: `wiki:wiki` or `wiki:wiki:readonly`
