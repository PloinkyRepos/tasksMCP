# Agents Working Guide

## Canonical links

The canonical HTML documentation entry point is [docs/index.html](./docs/index.html).

The full documentation folder is [docs](./docs/).

The design specifications entry point is [docs/specs/matrix.md](./docs/specs/matrix.md).

## Language policy

All documentation and specifications must be written in English.

## HTML documentation style rules

The HTML documentation must use a technical writing style with minimal code examples.

The content should explain the current repository scope around `tasksAgent` as a Ploinky intermediary between Explorer UI task flows and backlog runtime operations. It should document MCP exposure, tool contracts, wrapper lifecycle, path constraints, and plugin integration behavior in operational terms.

## Specification writing rules

Specifications must always include `DS01-Vision` and `DS02-Architecture`. Additional DS files are added only when needed by scope.

Specifications must focus on rules, constraints, and invariants. The emphasis is on what the Ploinky agent must do, independent of implementation details or historical steps used to reach the outcome.

Specifications should avoid excessive bullet-list formatting. Narrative, requirement-style sections are preferred when possible.

Specifications must keep the same agent story as the HTML docs, but from an agent-contract perspective. `tasksAgent` must remain defined as the intermediary between Explorer UI intent and backlog operations.

## Change management requirement

Any code change must be reflected in the HTML documentation under `docs`, in the specifications under `docs/specs`, and validated by running the task agent tests under `tasksAgent/tests`.
