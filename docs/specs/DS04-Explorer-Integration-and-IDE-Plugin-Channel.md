# DS04 - Explorer Integration and IDE Plugin Channel

## Role of This Document

This document defines integration rules for Explorer-facing usage of `tasksAgent` and its IDE plugin channel.

## Integration Position

Explorer is UI host and interaction layer. `tasksAgent` is backend operation layer for backlog files. IDE plugin assets under `tasksAgent/IDE-plugins/tasks-tool-button/` provide the integration bridge from Explorer UI events to MCP tool calls.

## Integration Requirements

Requirement U1: Explorer task interactions shall invoke `tasksAgent` MCP tools instead of direct backend file mutations.

Requirement U2: plugin toolbar entry at `file-exp:toolbar` shall remain documented and operational.

Requirement U3: plugin components shall remain declaratively registered through plugin configuration.

Requirement U4: UI state transitions for task create/update/delete/reorder shall be based on MCP outcomes.

Requirement U5: conflict and create-file modal flows shall remain agent-contract-driven.

## Constraints

Constraint Q1: UI code cannot bypass MCP and directly mutate backlog files as backend authority.

Constraint Q2: host UI refactors cannot alter MCP contract semantics.

Constraint Q3: plugin metadata changes cannot break declared integration points without coordinated docs/spec updates.

## Invariants

Invariant P1: Explorer-to-agent communication remains MCP-based.

Invariant P2: IDE plugin channel remains integration surface, while task semantics remain backend-owned.

Invariant P3: intermediary role of `tasksAgent` between UI intent and backlog operations remains unchanged.

## Validation Criteria

Validation is satisfied when plugin actions call `tasksAgent` tools successfully, contract outputs drive expected UI behavior, and backend task semantics remain isolated from UI internals.
