# tasksAgent

MCP agent for backlog files stored inside a workspace repository.

## Responsibilities

- load backlog configuration
- list and search tasks
- read individual tasks
- create, update, delete, and reorder tasks
- keep backlog paths inside the selected repository root

## Available tools

- `task_config`
- `task_list`
- `task_history_list`
- `task_get`
- `task_create`
- `task_update`
- `task_delete`
- `task_reorder`

All tools are dispatched through [tools/tasks_tool.sh](./tools/tasks_tool.sh) to [tools/tasks_tool.mjs](./tools/tasks_tool.mjs).

## Path rules

- `repoPath` must be an absolute filesystem path to a repository directory.
- `backlogPath` must be an absolute path inside `repoPath`.
- backlog files must end with `.backlog`
- history files must end with `.history`

The tool normalizes `/.ploinky/...` inputs to the real workspace path before validation.

## Runtime

The agent uses the generic Node MCP runtime defined in [manifest.json](./manifest.json).

Relevant environment variables:

- `ASSISTOS_FS_ROOT`
- `WORKSPACE_ROOT`
- `PLOINKY_WORKSPACE_ROOT`
- `LOCK_FOLDER`

## UI integration

The repo also contains the Explorer plugin button in [IDE-plugins/tasks-tool-button](./IDE-plugins/tasks-tool-button), which is the expected entry point for interactive task management in the Explorer UI.

## Documentation

- [TA01 - Tasks Agent Overview](./docs/specs/TA/TA01-agent-overview.md)
- [TA02 - Explorer Plugin](./docs/specs/TA/TA02-explorer-plugin.md)
