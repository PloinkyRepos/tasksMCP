# DS03 - MCP Tool Contracts and Invocation Lifecycle

## Role of This Document

This document defines contract and lifecycle guarantees for `tasksAgent` MCP operations.

## Contract Surface

Tool names declared in `mcp-config.json` are public contracts. The set includes config read, task list and history list, single-task read, task create/update/delete, and reorder operations.

Each contract shall define required arguments and optional controls such as filtering and force-save behavior.

## Invocation Lifecycle Rules

Lifecycle Rule L1: each invocation begins by reading and parsing MCP envelope input from stdin.

Lifecycle Rule L2: envelope normalization shall extract operational input from supported MCP payload shapes.

Lifecycle Rule L3: tool identity resolution shall use `TOOL_NAME` and documented fallback fields.

Lifecycle Rule L4: argument validation shall run before task operation dispatch.

Lifecycle Rule L5: path policy checks for `repoPath` and backlog/history path arguments shall execute before file IO.

Lifecycle Rule L6: operation output shall be serialized as JSON response payload.

## Failure Semantics

Failure Rule F1: missing tool identity fails explicitly.

Failure Rule F2: invalid path arguments fail explicitly.

Failure Rule F3: unsupported tool names fail explicitly.

Failure Rule F4: backlog IO failures return explicit error payloads and do not silently report success.

## Constraints

Constraint M1: contracts cannot depend on undocumented request fields.

Constraint M2: tool handlers cannot operate outside validated repository paths.

Constraint M3: response format drift for the same contract is forbidden unless explicitly documented.

## Invariants

Invariant T1: tool contract identity remains explicit and deterministic.

Invariant T2: lifecycle order remains parse, normalize, validate, dispatch, execute, respond.

Invariant T3: mutation operations remain guarded by path and file-type policy checks.

## Validation Criteria

Validation is satisfied when MCP clients can call task tools with schema-compliant inputs, receive deterministic success or explicit failures, and observe consistent lifecycle behavior across invocations.
