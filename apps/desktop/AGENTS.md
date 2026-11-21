# Desktop design rules

- Keep the window frameless. Use a compact, draggable white (`#ffffff`) top bar with black (`#000000`) text, icons, and controls. Keep interactive areas outside the drag region.
- Use `#050505` for the workspace and native window background, and `#ffffff` for text and icons on dark surfaces. Use 1px borders and outlines to separate surfaces and indicate focus. Keep the model picker in the top bar and connection details in its popover.
- Size spacing, controls, and corner radii on the 8px grid. Let chat width and control arrangement adapt to the window, and wrap controls when space is tight.
- Use a collapsible bot sidebar in the app shell. Show names when expanded and keep the colored bot circles and create button usable when collapsed.
- Represent bots as colored circles with editable names. Offer `#FF884C`, `#3551FF`, and `#FF0844` as presets alongside custom colors. Show which bot is selected without relying on color. Give every circle an accessible name and expose the bot name on hover or focus.
- Use locally bundled provider marks. Display effort controls only for documented or provider-reported levels for the selected model. Fall back to the provider default when capabilities are unknown.
- Keep the active bot and the current status of its work clear. Use distinct states for queued, running, completed, failed, and cancelled turns. Give users a clear recovery action when a connection or turn fails.
- Preview the recipients and providers before a linked flow runs. Keep manual handoffs deliberate and make clear what text will be forwarded. Confirm destructive actions such as clearing a chat.
- Keep the renderer sandboxed and use the typed preload bridge for app data. The main process owns provider credentials, SQLite, and workflow execution. Render model output as untrusted text and keep credentials out of chat storage and logs.
