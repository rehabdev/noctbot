<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Noctbot design rules

- Keep the interface quiet and direct. Use plain labels for actions and status. Add copy when it helps someone act, understand a result, or recover from an error.
- Use an 8px base unit for spacing, control sizes, layout, and corner radii. Size true circles on the same grid. Use fluid widths, wrapping, and responsive breakpoints where the layout needs them.
- Use 1px borders and outlines, including focus outlines. Use `#050505` for dark app backgrounds and `#ffffff` for text and icons on dark surfaces.
- Offer `#FF884C`, `#3551FF`, and `#FF0844` as agent color presets. Pair meaningful color with a text label or other recognizable cue.
- Preserve keyboard access, visible focus, readable contrast, and accessible names for icon buttons. Let layouts adapt to smaller windows and text zoom. Respect reduced motion.
- Reuse existing patterns and controls before adding a new component or dependency. Use semantic elements and keep styles close to the workspace that owns them.
- Show real data and distinguish empty, loading, success, and error states. Label unsupported features as unavailable. Never present a placeholder connection or operation as working.

Workspace guidance lives in `apps/desktop/AGENTS.md`, `apps/web/AGENTS.md`, and `packages/ui/AGENTS.md`.
