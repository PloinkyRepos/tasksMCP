# TA02 - Tasks Explorer Plugin

## Summary

Pluginul `tasks-tool-button` este integrarea UI pentru task management în Explorer și se montează în `file-exp:toolbar`.

## Plugin Registration

Conform [config.json](/Users/adrianganga/Desktop/devWork/testExplorer/.ploinky/repos/tasksAssistant/tasksAgent/IDE-plugins/tasks-tool-button/config.json):

- `pluginCategory`: `application`
- `id`: `tasks`
- `location`: `file-exp:toolbar`
- `component`: `tasks-tool-button`

## Dependency Graph

Pluginul include componente precum:

- `backlog-panel`
- `backlog-task-row`
- `task-item`
- `backlog-create-modal`
- `backlog-create-file-modal`
- `backlog-conflict-modal`
- `document-tasks-modal`

## Ownership Rules

Explorer deține:

- slotul și contextul document/path
- refresh generic și navigation shell

Tasks plugin deține:

- backlog browsing
- task editing
- conflict resolution pentru backlog files
- document-task linking UI
