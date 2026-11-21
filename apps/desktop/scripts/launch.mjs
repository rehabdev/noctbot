// Launch the desktop runtime even when the parent process uses Electron as Node.
delete process.env.ELECTRON_RUN_AS_NODE;
await import("electron/cli.js");
