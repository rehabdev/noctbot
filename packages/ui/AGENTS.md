# Shared UI design rules

- Put a component here when multiple consumers need the same behavior or presentation. Keep app-specific layouts and flows in their owning apps.
- Use typed props and semantic elements. Support keyboard interaction and accessible names, and provide a visible focus state for interactive components.
- Let consumers supply styling and content. Keep shared components independent of Electron, Next.js routing, provider state, and persistence.
