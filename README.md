# tasksAssistant

Workspace task management repository for Ploinky.

## Components

- [tasksAgent](./tasksAgent/README.md): MCP agent for backlog CRUD, search, history, and reorder operations
- [tasks-tool-button](./tasksAgent/IDE-plugins/tasks-tool-button): Explorer UI entry point for task workflows

## Backlog model

The agent operates on repository-local backlog files:

- tasks: `*.backlog`
- history: `*.history`

## Environment

The runtime relies on workspace-root variables exposed by Ploinky:

- `ASSISTOS_FS_ROOT`
- `WORKSPACE_ROOT`
- `PLOINKY_WORKSPACE_ROOT`
- `LOCK_FOLDER`
