# Tokenizer Refactor Plan

## Goal

Refactor `@pierre/diffs` so syntax highlighting is tokenizer-pluggable rather
than coupled to Shiki internals, while preserving current behavior by default.

## Three Integration Modes

1. Default Shiki mode. Use built-in Shiki-backed highlighting with full backward
   compatibility.

2. Local custom tokenizer mode. Provide a custom local tokenizer adapter (for
   example Arborium) that runs in the client/server runtime.

3. Cloud token stream mode. Connect a remote tokenizer that streams tokens from
   a third-party code storage system and render directly from those token
   frames.

## Design Constraints

1. Keep Shiki as the default path with no behavioral regressions.
2. Support non-Shiki tokenizers such as Arborium.
3. Avoid token model lock-in by centering the abstraction on rendered line
   output and theme metadata.
4. Keep worker and stream support capability-based instead of mandatory.
5. Support a future third-party cloud token stream where highlighting tokens are
   produced remotely and consumed directly by `@pierre/diffs`.

## Plan

1. Add a tokenizer abstraction centered on rendered lines, not Shiki tokens.
   Define a `DiffsTokenizer` contract that returns line-level highlighted output
   and theme metadata. Include capability flags such as `supportsWorkers`,
   `supportsStreaming`, `supportsDecorations`, and `supportsDualTheme`.

2. Keep Shiki as the default adapter behind that contract. Implement a
   `ShikiTokenizerAdapter` that wraps existing behavior and keeps snapshots and
   API defaults stable.

3. Refactor renderers to consume `tokenizer` instead of `DiffsHighlighter`.
   Update `FileRenderer`, `DiffHunksRenderer`, SSR preload utilities, and option
   plumbing. Add `tokenizer?: DiffsTokenizer` to shared base options.

4. Decouple theme CSS generation from Shiki theme objects. Move theme-style
   emission into adapter output so each tokenizer provides its own theme
   metadata while preserving the current CSS variable contract.

5. Split tokenizer-independent API from Shiki-specific utilities. Keep root
   exports compatible initially. Add explicit Shiki-scoped exports for utilities
   like `registerCustomLanguage`, `registerCustomTheme`, and
   `preloadHighlighter`.

6. Build an Arborium spike adapter before full integration. Implement
   `ArboriumTokenizerAdapter` using `loadGrammar` and `highlight`. Validate
   HTML-to-line-AST conversion, theme style behavior, and inline diff decoration
   compatibility.

7. Roll out worker support in phases. Phase A: custom tokenizers supported on
   main thread and SSR. Phase B: worker bootstrap contract for tokenizers that
   can initialize in workers (Arborium expected to be compatible with async
   grammar loading).

8. Roll out streaming support in phases. Keep current Shiki `FileStream` path.
   Make streaming optional in the tokenizer contract so non-streaming tokenizers
   can opt out initially.

9. Add a cloud token ingress contract for future third-party code storage
   systems. Define a canonical incoming token frame format that includes stable
   file identity, version/hash, line index mapping, token payload, and
   completion markers. Add ordering and idempotency requirements so out-of-order
   frames do not corrupt UI state.

10. Add a pass-through remote tokenizer adapter. Add `RemoteTokenizerAdapter`
    (or equivalent) that bypasses local lexing and converts remote token frames
    into the same line output consumed by renderers. Require graceful fallback
    to a local tokenizer when the remote stream is unavailable or incomplete.

11. Add compatibility and migration coverage. Keep existing Shiki snapshots
    unchanged. Add tokenizer contract tests that run against both Shiki and
    Arborium adapters. Document migration and adapter usage.

## Proposed PR Sequence

1. PR1: Tokenizer contract + Shiki adapter shell.
2. PR2: Renderer and SSR migration to tokenizer contract.
3. PR3: Arborium adapter spike + docs example.
4. PR4: Worker tokenizer bootstrap + optional streaming extensions.
5. PR5: Cloud token stream contract + remote adapter + fallback behavior.

## Current Implementation Status

1. PR1 complete.
2. PR2 complete.
3. PR3 complete: `ArboriumTokenizer` adapter and usage docs added as a spike.
4. PR4 complete: worker tokenizer bootstrap/runtime generalized beyond Shiki;
   streaming remains capability-gated with Shiki as the active stream adapter.
5. PR5 stub complete: remote token contract + `RemoteTokenizer` adapter with
   fallback behavior (cloud transport remains provider-implemented).

## Acceptance Criteria

1. Existing Shiki-based public behavior remains unchanged by default.
2. A custom tokenizer can be passed through API options without touching Shiki
   internals.
3. Arborium can render at least one file and one diff path in a docs/demo
   scenario.
4. Worker and stream behavior are explicit about tokenizer capability support.
5. A remote token stream can drive file or diff highlighting without requiring
   local grammar loading.
6. If remote token streaming fails, rendering falls back to a configured local
   tokenizer without breaking interaction.
