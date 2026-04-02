# DS01 - Vision

## Role of This Document

This document defines strategic rules for `tasksAgent` as a Ploinky agent that mediates between Explorer task workflows and backlog file operations.

## Agent Context

`tasksAgent` is integrated in Ploinky and consumed by Explorer flows that need repository task management. The agent is not a UI renderer and not a generic filesystem mutation proxy. It exposes MCP contracts for backlog operations while enforcing scope and path constraints.

The repository can host additional agents over time. This specification set addresses the current `tasksAgent` behavior.

## Vision Direction

The direction is to keep task-file operations behind MCP contracts and use Explorer as interaction layer only. The agent must preserve deterministic operation semantics for unchanged inputs and maintain explicit path-policy enforcement.

## Agent Expectations

Expectation E1: supported UI clients can discover and call the same task tools through MCP.

Expectation E2: backlog and history operations remain constrained to repository-local paths.

Expectation E3: task mutation flows preserve persistence consistency.

Expectation E4: error outcomes are explicit and suitable for UI conflict handling.

## Requirements

Requirement R1: the agent shall expose task management only through declared MCP tools.

Requirement R2: the agent shall preserve intermediary behavior by translating UI requests into validated backlog operations.

Requirement R3: the agent shall enforce repository-root path boundaries for backlog and history files.

Requirement R4: the agent shall support list, history, get, create, update, delete, and reorder operations as contract operations.

Requirement R5: the agent shall preserve Explorer plugin integration as the UI extension channel.

## Constraints

Constraint C1: direct UI writes that bypass MCP task contracts are out of scope for this agent.

Constraint C2: operations outside repository root are forbidden.

Constraint C3: changing tool semantics is allowed only when contracts, documentation, specifications, and tests are updated in the same change scope.

Constraint C4: hidden backlog mutation side effects outside declared files are forbidden.

## Invariants

Invariant I1: `tasksAgent` remains an intermediary between Explorer intent and backlog file execution.

Invariant I2: MCP tool names remain the public agent contract for the current repository state.

Invariant I3: task-operation failures remain explicit and attributable.

Invariant I4: path safety checks remain mandatory before backlog mutation.

## Validation Criteria

The agent passes vision validation when Explorer workflows can manage tasks through MCP contracts, path constraints are enforced for all operations, and contract behavior remains predictable for unchanged inputs.
