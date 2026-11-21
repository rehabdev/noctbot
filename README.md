# noctbot

Noctbot is a Bun-managed Turborepo monorepo with TypeScript web and desktop apps under `apps/` and shared packages under `packages/`.

## Commands

- `bun install` — install workspace dependencies
- `bun run dev` — start workspace development servers through Turborepo
- `bun run build` — build the web and desktop workspaces
- `bun run lint` — lint the monorepo with Biome
- `bun run check-types` — type-check workspace packages
- `bun run format` — format files supported by Biome

The current shared packages are `@repo/ui` and `@repo/typescript-config`.
