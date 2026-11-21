import { contextBridge, ipcRenderer } from "electron";
import type { WorkspaceBridge } from "./workspace-types";

const workspace: WorkspaceBridge = {
  connect: (provider, key) =>
    ipcRenderer.invoke("workspace:connect", provider, key),
  initialize: (legacy) => ipcRenderer.invoke("workspace:initialize", legacy),
  createBot: (name, color) =>
    ipcRenderer.invoke("workspace:createBot", name, color),
  renameBot: (id, name, color) =>
    ipcRenderer.invoke("workspace:renameBot", id, name, color),
  saveBot: (bot) => ipcRenderer.invoke("workspace:saveBot", bot),
  turns: (bot) => ipcRenderer.invoke("workspace:turns", bot),
  enqueue: (bot, prompt) =>
    ipcRenderer.invoke("workspace:enqueue", bot, prompt),
  run: (bot, turn) => ipcRenderer.invoke("workspace:run", bot, turn),
  cancel: (bot, turn) => ipcRenderer.invoke("workspace:cancel", bot, turn),
  handoff: (bot, turn) => ipcRenderer.invoke("workspace:handoff", bot, turn),
  runFlow: (bot, turn, targets) =>
    ipcRenderer.invoke("workspace:runFlow", bot, turn, targets),
  clear: (bot) => ipcRenderer.invoke("workspace:clear", bot),
};

contextBridge.exposeInMainWorld("workspace", workspace);
