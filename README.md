# gitAgent

Ploinky Git agent that exposes Git functionality via MCP tools. Explorer and other UIs call `gitAgent` instead of running Git directly.

## Overview
- MCP tools are defined in `mcp-config.json`.
- Tool execution is routed through `tools/git_tool.mjs`.
- Git logic lives in `lib/git-service.mjs`.
- Commit message generation uses `lib/git-commit-message.js` (LLM-based).

## Available MCP tools
- `git_info`, `git_status`, `git_diff`
- `git_stage`, `git_unstage`, `git_untrack`, `git_check_ignore`, `git_restore`
- `git_conflict_versions`, `git_checkout_conflict`
- `git_stash`, `git_stash_pop`
- `git_commit`, `git_push`, `git_pull`, `git_diagnose`
- `git_repos_overview`, `git_identity`, `git_set_identity`
- `git_commit_message`

## Example request
Use POST JSON-RPC with MCP:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "git_status",
    "arguments": {
      "path": "/Users/adrianganga/Desktop/devWork/test1/.ploinky/repos/fileExplorer"
    }
  }
}
```

## Example response
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"ok\":true,\"status\":{...}}"
      }
    ]
  }
}
```

## Environment
The agent respects these roots when validating paths:
- `ASSISTOS_FS_ROOT`
- `WORKSPACE_ROOT`
- `PLOINKY_WORKSPACE_ROOT`

## Notes
- `git_commit_message` requires LLM configuration via `achillesAgentLib`.
- Paths must be within allowed roots. Absolute or workspace-relative paths are accepted.
