# DS02 - Architecture

## Role of This Document

This document defines mandatory architecture rules for `tasksAgent` as a Ploinky MCP agent.

## Architectural Boundary

The architecture boundary starts at MCP tool invocation and ends at serialized operation response. Explorer UI rendering and host interactions remain outside this boundary. Backlog file execution logic remains inside the agent.

## Architecture Shape

The architecture is organized into contract, wrapper, dispatch, backlog-IO, and plugin-integration layers.

The contract layer declares tools in `mcp-config.json`. The wrapper layer executes `tools/tasks_tool.sh` for each call. The dispatch layer in `tasks_tool.mjs` parses envelopes, normalizes input, and routes tool handlers. The backlog-IO layer relies on Achilles BacklogManager operations for load, refresh, save, and force-save semantics. The plugin-integration layer exposes Explorer UI extension artifacts through `IDE-plugins/tasks-tool-button`.

## Architectural Requirements

Requirement A1: tool declaration shall remain configuration-driven through `mcp-config.json`.

Requirement A2: each invocation shall run through wrapper and dispatcher layers before any backlog mutation.

Requirement A3: tool resolution shall be explicit and fail on unsupported tool names.

Requirement A4: repository-root and path-extension validation shall execute before file operations.

Requirement A5: task mutation flows shall route through backlog persistence functions and return serialized outcomes.

Requirement A6: Explorer integration shall call MCP tools and shall not embed private backlog runtime operations.

## Constraints

Constraint K1: invocation paths that bypass wrapper parsing and validation are forbidden.

Constraint K2: backlog operations outside allowed path boundaries are forbidden.

Constraint K3: architecture changes that move mutation authority into Explorer UI are forbidden.

Constraint K4: contract behavior cannot depend on undocumented envelope fields.

## Invariants

Invariant V1: one MCP tool request maps to one declared operation path.

Invariant V2: path and extension policy remain mandatory for backlog and history files.

Invariant V3: responses remain machine-readable and include explicit error outcomes when failing.

Invariant V4: IDE plugin channel remains integration surface, while backend semantics remain in the agent.

## Architecture Validation Criteria

Architecture validation succeeds when declared tools execute through wrapper and dispatcher flow, path and file-type constraints are enforced, backlog persistence behavior remains consistent, and Explorer integration remains decoupled from backend internals.
