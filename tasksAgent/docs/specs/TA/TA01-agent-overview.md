# TA01 - Tasks Agent Overview

## Summary

`tasksAgent` este agentul MCP pentru backlog files și task management în repo-urile din workspace.

## Background / Problem Statement

Explorer are nevoie de task management contextualizat pe repo și document, fără să implementeze în host reguli de backlog, reorder și conflict handling.

## Goals

1. CRUD pentru task-uri și backlog files
2. validare strictă a path-urilor și extensiilor
3. integrare UI dedicată în Explorer

## Architecture Overview

| Area | Responsibility |
|---|---|
| `tools/tasks_tool.sh` + `tools/tasks_tool.mjs` | dispatch MCP și operații de bază |
| `IDE-plugins/tasks-tool-button/` | intrarea UI din Explorer |

## API Contracts

Tooluri cheie:

- `task_config`
- `task_list`
- `task_history_list`
- `task_get`
- `task_create`
- `task_update`
- `task_delete`
- `task_reorder`

## Configuration

Variabile relevante:

- `ASSISTOS_FS_ROOT`
- `WORKSPACE_ROOT`
- `PLOINKY_WORKSPACE_ROOT`
- `LOCK_FOLDER`

## Related Specs

- [TA02 - Explorer Plugin](/Users/adrianganga/Desktop/devWork/testExplorer/.ploinky/repos/tasksAssistant/tasksAgent/docs/specs/TA/TA02-explorer-plugin.md)
