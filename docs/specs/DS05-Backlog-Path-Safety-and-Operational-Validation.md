# DS05 - Backlog Path Safety and Operational Validation

## Role of This Document

This document defines mandatory safeguards for backlog path policy, persistence behavior, and operational validation.

## Safety and Persistence Scope

`tasksAgent` processes task data from repository-local backlog files. The agent must constrain file operations to valid repository scope and preserve consistent persistence behavior through backlog IO functions.

## Operational Requirements

Requirement O1: repository root shall be resolved from explicit `repoPath` input and validated as absolute existing directory path.

Requirement O2: backlog paths shall be absolute, inside repository root, and use `.backlog` extension.

Requirement O3: history paths shall be absolute, inside repository root, and use `.history` extension.

Requirement O4: task mutation operations shall use load/save/refresh semantics before reporting success.

Requirement O5: force-save behavior shall remain available where mutation contracts declare `forceSave` controls.

Requirement O6: repository validation shall run through task agent tests under `tasksAgent/tests`.

## Constraints

Constraint R1: path traversal or external path resolution outside repo root is forbidden.

Constraint R2: changing declared tool contracts is allowed only when contracts, documentation, specifications, and tests are updated together.

Constraint R3: operations that mutate backlog state without persistence write path are forbidden.

## Invariants

Invariant G1: path and extension checks remain mandatory before backlog or history file access.

Invariant G2: task mutation outcomes remain explicit and serialized in contract responses.

Invariant G3: operational diagnostics remain visible to MCP clients.

## Validation Criteria

Validation is satisfied when invalid path operations fail safely, mutation operations persist expected file changes, declared contracts remain aligned with configuration, and task agent tests pass for code changes.
