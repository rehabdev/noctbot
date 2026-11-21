type ChatTurn = import("./model-types").ChatTurn;
type Bot = import("./workspace-types").Bot;
type Turn = import("./workspace-types").Turn;
type Model = import("./model-types").Model;
type Provider = import("./model-types").Provider;

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element;
}

const bridge = (
  window as Window & { workspace?: import("./workspace-types").WorkspaceBridge }
).workspace;
const connectionForm = requiredElement<HTMLFormElement>("connection");
const providerBrand = requiredElement<HTMLImageElement>("provider-brand");
const provider = requiredElement<HTMLSelectElement>("provider");
const keyRow = requiredElement<HTMLDivElement>("key-row");
const key = requiredElement<HTMLInputElement>("key");
const connectButton = requiredElement<HTMLButtonElement>("connect");
const connectionStatus = requiredElement<HTMLParagraphElement>("status");
const model = requiredElement<HTMLSelectElement>("model");
const effort = requiredElement<HTMLInputElement>("effort");
const effortValue = requiredElement<HTMLOutputElement>("effort-value");
const composer = requiredElement<HTMLFormElement>("composer");
const promptInput = requiredElement<HTMLTextAreaElement>("prompt");
const sendButton = requiredElement<HTMLButtonElement>("send");
const requestStatus = requiredElement<HTMLParagraphElement>("request-status");
const settings = requiredElement<HTMLDetailsElement>("settings");
const transcript = requiredElement<HTMLDivElement>("transcript");
const empty = requiredElement<HTMLDivElement>("empty");
const emptyAvatar = requiredElement<HTMLSpanElement>("empty-avatar");
const emptyTitle = requiredElement<HTMLHeadingElement>("empty-title");
const emptyDescription =
  requiredElement<HTMLParagraphElement>("empty-description");
const messageList = requiredElement<HTMLDivElement>("messages");
const newChat = requiredElement<HTMLButtonElement>("new-chat");
const resetDialog = requiredElement<HTMLDialogElement>("reset-dialog");
const storageKey = "noctbot.desktop.conversation.v1";

function restoreConversation(): ChatTurn[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter(
        (turn): turn is ChatTurn =>
          typeof turn?.prompt === "string" && typeof turn.answer === "string",
      )
      .slice(-100);
  } catch {
    return [];
  }
}

const botList = requiredElement<HTMLDivElement>("bots");
const chatBotDot = requiredElement<HTMLSpanElement>("chat-bot-dot");
const botTitle = requiredElement<HTMLHeadingElement>("bot-title");
const addBot = requiredElement<HTMLButtonElement>("add-bot");
const sidebar = requiredElement<HTMLElement>("bot-sidebar");
const sidebarToggle = requiredElement<HTMLButtonElement>("sidebar-toggle");
const sidebarPreference = "noctbot.desktop.sidebar-expanded";
const compactWindow = window.matchMedia("(max-width: 600px)");
let savedSidebar: string | null = null;
try {
  savedSidebar = localStorage.getItem(sidebarPreference);
} catch {
  // The sidebar remains usable when storage is unavailable.
}

function setSidebarExpanded(expanded: boolean) {
  sidebar.classList.toggle("is-expanded", expanded);
  sidebarToggle.setAttribute("aria-expanded", String(expanded));
  const label = expanded ? "Collapse bot sidebar" : "Expand bot sidebar";
  sidebarToggle.setAttribute("aria-label", label);
  sidebarToggle.title = label;
}

function restoreSidebar() {
  setSidebarExpanded(
    savedSidebar === null ? !compactWindow.matches : savedSidebar === "true",
  );
}

restoreSidebar();
compactWindow.addEventListener("change", restoreSidebar);
sidebarToggle.addEventListener("click", () => {
  const expanded = !sidebar.classList.contains("is-expanded");
  savedSidebar = String(expanded);
  setSidebarExpanded(expanded);
  try {
    localStorage.setItem(sidebarPreference, savedSidebar);
  } catch {
    // Keep the selected state for the current window.
  }
});
const linkPicker = requiredElement<HTMLSelectElement>("linked-bot");
const queueButton = requiredElement<HTMLButtonElement>("queue");
const editBot = requiredElement<HTMLButtonElement>("edit-bot");
const botDialogTitle = requiredElement<HTMLHeadingElement>("bot-dialog-title");
const saveAppearance = requiredElement<HTMLButtonElement>("save-appearance");
let editingBot: Bot | undefined;
const botDialog = requiredElement<HTMLDialogElement>("bot-dialog");
const botForm = requiredElement<HTMLFormElement>("create-bot");
const botName = requiredElement<HTMLInputElement>("bot-name");
const botColor = requiredElement<HTMLInputElement>("bot-color");
const colorSwatches =
  botForm.querySelectorAll<HTMLButtonElement>(".color-swatch");
function syncSwatches() {
  for (const swatch of colorSwatches) {
    swatch.setAttribute(
      "aria-pressed",
      String(swatch.dataset.color?.toLowerCase() === botColor.value),
    );
  }
}
for (const swatch of colorSwatches) {
  swatch.addEventListener("click", () => {
    if (swatch.dataset.color) botColor.value = swatch.dataset.color;
    syncSwatches();
  });
}
botColor.addEventListener("input", syncSwatches);
const botError = requiredElement<HTMLParagraphElement>("bot-error");
let bots: Bot[] = [];
let activeBot: Bot | undefined;
let currentTurns: Turn[] = [];
const catalogs = new Map<Provider, Model[]>();
let busy = false;
const brands: Record<Provider, string> = {
  codex: "openai",
  openai: "openai",
  anthropic: "claude",
  grok: "grok",
  gemini: "gemini",
  kimi: "kimi",
  mistral: "mistral",
  opencode: "opencode",
  ollama: "ollama",
  lmstudio: "lmstudio",
};

function activeProvider() {
  return provider.value as Provider;
}

function activeModel() {
  return catalogs.get(activeProvider())?.find(({ id }) => id === model.value);
}

function showEffort() {
  const selected = activeModel()?.efforts[Number(effort.value) - 1];
  effortValue.value = selected
    ? selected[0]?.toUpperCase() + selected.slice(1)
    : activeModel()?.defaultEffort
      ? `Default · ${activeModel()?.defaultEffort}`
      : activeModel()?.efforts.length
        ? "Provider default"
        : "Provider default only";
  effort.setAttribute("aria-valuetext", effortValue.value);
}

function syncControls() {
  const selected = activeModel();
  provider.disabled = busy;
  key.disabled = busy;
  connectButton.disabled = busy || !bridge;
  model.disabled = busy || !catalogs.get(activeProvider())?.length;
  effort.disabled = busy || !selected?.efforts.length;
  sendButton.disabled = busy || !selected || !bridge;
  sendButton.disabled ||= !activeBot;
  emptyDescription.textContent = selected
    ? "Send a message to begin."
    : "Connect a model to start chatting.";
  queueButton.disabled = sendButton.disabled;
  addBot.disabled = busy || !bridge;
  editBot.disabled = busy || !activeBot;
  linkPicker.disabled = busy || !activeBot;
  newChat.disabled = busy || !currentTurns.length;
  for (const button of botList.querySelectorAll("button"))
    button.disabled = busy;
  for (const button of messageList.querySelectorAll("button"))
    button.disabled = busy;
}

function resetEffort() {
  const selected = activeModel();
  effort.max = String(Math.max(1, selected?.efforts.length ?? 0));
  const index = selected?.efforts.indexOf(activeBot?.effort ?? "") ?? -1;
  effort.value = String(index + 1);
  showEffort();
  syncControls();
}

function showModels() {
  const found = catalogs.get(activeProvider()) ?? [];
  model.replaceChildren(
    ...(found.length
      ? found.map(({ name, id }) => new Option(name, id))
      : [new Option("Connect to load models", "")]),
  );
  if (
    activeBot?.model &&
    activeBot.provider === activeProvider() &&
    found.length
  ) {
    if (found.some(({ id }) => id === activeBot?.model)) {
      model.value = activeBot.model;
    } else {
      model.add(new Option("Saved model unavailable", ""), 0);
      model.value = "";
    }
  }
  resetEffort();
}

async function saveSelection() {
  if (!bridge || !activeBot) return;
  const source = activeProvider();
  const selection = activeModel();
  const keepSaved = !selection && activeBot.provider === source;
  const updated = {
    ...activeBot,
    provider: source,
    model: selection?.id ?? (keepSaved ? activeBot.model : ""),
    effort:
      selection?.efforts[Number(effort.value) - 1] ??
      (keepSaved ? activeBot.effort : ""),
    linked_bot_id: linkPicker.value ? Number(linkPicker.value) : null,
  };
  await bridge.saveBot(updated);
  Object.assign(activeBot, updated);
}

function describeError(error: unknown) {
  return error instanceof Error
    ? error.message.replace(
        /^Error invoking remote method '[^']+': Error: /,
        "",
      )
    : "Request failed.";
}

async function detectModels() {
  if (busy || !bridge) return;
  busy = true;
  syncControls();
  const selected = activeProvider();
  connectionStatus.textContent = "Detecting models…";
  try {
    const found = await bridge.connect(selected, key.value || undefined);
    catalogs.set(selected, found);
    key.value = "";
    connectionStatus.textContent = found.length
      ? `${found.length} model${found.length === 1 ? "" : "s"} available`
      : "No text models were found.";
    showModels();
    if (found.length && !activeBot?.model) await saveSelection();
    if (found.length) settings.open = false;
  } catch (error) {
    connectionStatus.textContent = describeError(error);
    settings.open = true;
  } finally {
    busy = false;
    syncControls();
  }
}

function showProvider() {
  key.value = "";
  const source = activeProvider();
  providerBrand.src = `./brands/${brands[source]}.svg`;
  keyRow.hidden = source === "codex" || source === "ollama";
  requestStatus.textContent = "";
  connectButton.textContent = keyRow.hidden ? "Detect models" : "Connect";
  connectionStatus.textContent = catalogs.has(activeProvider())
    ? "Connected for this session."
    : keyRow.hidden
      ? source === "codex"
        ? "Sign in with codex login, then detect models."
        : "Start Ollama locally, then detect models."
      : source === "lmstudio"
        ? "Start the LM Studio server on port 1234. Enter a token only if required."
        : "Keys entered here are kept for this session. API usage is billed separately.";
  showModels();
}

provider.addEventListener("change", () => {
  showProvider();
  void action(saveSelection);
});
connectionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void detectModels();
});
model.addEventListener("change", () => {
  effort.value = "0";
  showEffort();
  effort.max = String(Math.max(1, activeModel()?.efforts.length ?? 0));
  void action(saveSelection);
});
effort.addEventListener("input", showEffort);
effort.addEventListener("change", () => void action(saveSelection));
linkPicker.addEventListener(
  "change",
  () =>
    void action(async () => {
      await saveSelection();
      renderConversation();
    }),
);
function appendMessage(role: "user" | "assistant", content: string) {
  const message = document.createElement("article");
  message.className = `message ${role}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : (activeBot?.name ?? "Bot");
  if (role === "assistant" && activeBot) {
    const dot = document.createElement("span");
    dot.className = "message-dot";
    dot.style.backgroundColor = activeBot.color;
    dot.setAttribute("aria-hidden", "true");
    label.prepend(dot);
  }
  const text = document.createElement("p");
  text.textContent = content;
  message.append(label, text);
  messageList.append(message);
  empty.hidden = true;
  transcript.scrollTop = transcript.scrollHeight;
  return message;
}

const flowDialog = requiredElement<HTMLDialogElement>("flow-dialog");
const flowTargets = requiredElement<HTMLOListElement>("flow-targets");
let pendingFlow:
  | { source: number; turn: number; targets: number[] }
  | undefined;

function openFlow(source: Bot, turn: number) {
  const seen = new Set([source.id]);
  const targets: Bot[] = [];
  let next = source.linked_bot_id;
  while (next !== null) {
    if (seen.has(next) || targets.length === 4) {
      requestStatus.textContent =
        "A flow can run up to four linked bots and cannot loop.";
      return;
    }
    const target = bots.find(({ id }) => id === next);
    if (!target) return;
    seen.add(next);
    targets.push(target);
    next = target.linked_bot_id;
  }
  if (!targets.length) return;
  flowTargets.replaceChildren(
    ...targets.map((target) => {
      const item = document.createElement("li");
      item.textContent = `${target.name} · ${target.provider} · ${target.model || "No model selected"}`;
      return item;
    }),
  );
  pendingFlow = {
    source: source.id,
    turn,
    targets: targets.map(({ id }) => id),
  };
  flowDialog.returnValue = "";
  flowDialog.showModal();
}

flowDialog.addEventListener("close", () => {
  const flow = pendingFlow;
  pendingFlow = undefined;
  if (!bridge || !flow || flowDialog.returnValue !== "run") return;
  const workspace = bridge;
  void action(async () => {
    requestStatus.textContent = "Running linked flow…";
    await workspace.runFlow(flow.source, flow.turn, flow.targets);
    requestStatus.textContent =
      "Linked flow completed. Open each bot to see its reply.";
  });
});

function renderConversation() {
  messageList.replaceChildren();
  empty.hidden = true;
  for (const turn of currentTurns) {
    appendMessage("user", turn.prompt);
    if (turn.answer) appendMessage("assistant", turn.answer);

    const actions = document.createElement("div");
    actions.className = "turn-actions";
    function button(label: string, callback: () => Promise<void>) {
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = label;
      control.addEventListener("click", () => void action(callback));
      actions.append(control);
    }

    if (turn.state !== "completed") {
      const state = document.createElement("span");
      state.textContent = turn.error ?? turn.state;
      actions.append(state);
    }
    const bot = activeBot;
    if (!bot || !bridge) continue;
    const workspace = bridge;
    if (turn.state === "queued" || turn.state === "failed") {
      button(turn.state === "failed" ? "Retry" : "Run", async () => {
        if (!activeModel())
          throw new Error("Connect and select the model for this bot.");
        await saveSelection();
        await runTurn(bot, turn.id);
      });
      button("Cancel", async () => {
        await workspace.cancel(bot.id, turn.id);
        await refreshTurns();
      });
    }
    if (turn.state === "completed" && bot.linked_bot_id !== null) {
      const recipient = bots.find(({ id }) => id === bot.linked_bot_id);
      if (recipient)
        button(`Queue for ${recipient.name}`, async () => {
          await workspace.handoff(bot.id, turn.id);
          requestStatus.textContent = `Reply queued for ${recipient.name}.`;
        });
    }
    if (turn.state === "completed" && bot.linked_bot_id !== null) {
      button("Run linked flow", async () => openFlow(bot, turn.id));
    }
    if (actions.childElementCount) messageList.append(actions);
  }
  empty.hidden = Boolean(currentTurns.length);
  transcript.scrollTop = transcript.scrollHeight;
}

async function refreshTurns() {
  if (!bridge || !activeBot) return;
  currentTurns = await bridge.turns(activeBot.id);
  renderConversation();
}

function renderBots() {
  botList.replaceChildren();
  for (const bot of bots) {
    const button = document.createElement("button");
    const dot = document.createElement("span");
    button.type = "button";
    button.title = bot.name;
    button.setAttribute("aria-label", bot.name);
    button.setAttribute("aria-pressed", String(bot.id === activeBot?.id));
    dot.className = "bot-dot";
    dot.style.backgroundColor = bot.color;
    const name = document.createElement("span");
    name.className = "bot-name";
    name.textContent = bot.name;
    button.append(dot, name);
    button.addEventListener("click", () => void action(() => selectBot(bot)));
    botList.append(button);
  }
}

async function selectBot(bot: Bot) {
  activeBot = bot;
  botTitle.textContent = bot.name;
  chatBotDot.style.backgroundColor = bot.color;
  emptyTitle.textContent = `Chat with ${bot.name}`;
  emptyAvatar.style.backgroundColor = bot.color;
  promptInput.placeholder = `Message ${bot.name}…`;
  provider.value = bot.provider;
  promptInput.value = "";
  linkPicker.replaceChildren(
    new Option("No linked bot", ""),
    ...bots
      .filter(({ id }) => id !== bot.id)
      .map(({ name, id }) => new Option(name, String(id))),
  );
  linkPicker.value =
    bot.linked_bot_id === null ? "" : String(bot.linked_bot_id);
  showProvider();
  renderBots();
  await refreshTurns();
}

async function action(callback: () => Promise<void>) {
  if (busy) return;
  busy = true;
  syncControls();
  try {
    await callback();
  } catch (error) {
    requestStatus.textContent = describeError(error);
  } finally {
    busy = false;
    syncControls();
  }
}

function openBotDialog(bot?: Bot) {
  editingBot = bot;
  botForm.reset();
  botName.value = bot?.name ?? "";
  botColor.value = bot?.color ?? "#FF884C";
  syncSwatches();
  botDialogTitle.textContent = bot ? "Edit bot" : "Create bot";
  saveAppearance.textContent = bot ? "Save" : "Create";
  botError.textContent = "";
  botDialog.showModal();
}

addBot.addEventListener("click", () => openBotDialog());
editBot.addEventListener("click", () => openBotDialog(activeBot));
requiredElement<HTMLButtonElement>("cancel-bot").addEventListener("click", () =>
  botDialog.close(),
);
botForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void action(async () => {
    if (!bridge) return;
    try {
      const bot = editingBot
        ? await bridge.renameBot(editingBot.id, botName.value, botColor.value)
        : await bridge.createBot(botName.value, botColor.value);
      const position = bots.findIndex(({ id }) => id === bot.id);
      if (position === -1) bots.push(bot);
      else bots[position] = bot;
      botDialog.close();
      await selectBot(bot);
    } catch (error) {
      botError.textContent = describeError(error);
    }
  });
});

newChat.addEventListener("click", () => {
  resetDialog.returnValue = "";
  resetDialog.showModal();
});
resetDialog.addEventListener("close", () => {
  if (resetDialog.returnValue !== "clear") return;
  void action(async () => {
    if (!bridge || !activeBot) return;
    await bridge.clear(activeBot.id);
    requestStatus.textContent = "";
    await refreshTurns();
    promptInput.focus();
  });
});

document.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Node && !settings.contains(event.target))
    settings.open = false;
});
settings.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    settings.open = false;
    settings.querySelector("summary")?.focus();
  }
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!sendButton.disabled) composer.requestSubmit();
  }
});

async function runTurn(bot: Bot, id: number) {
  if (!bridge) return;
  requestStatus.textContent = `${bot.name} is working…`;
  try {
    await bridge.run(bot.id, id);
  } finally {
    requestStatus.textContent = "";
    await refreshTurns();
  }
}

async function queuePrompt(runNow: boolean) {
  const bot = activeBot;
  const prompt = promptInput.value.trim();
  if (!bridge || !bot || !prompt || !activeModel()) return;
  await saveSelection();
  const id = await bridge.enqueue(bot.id, prompt);
  promptInput.value = "";
  await refreshTurns();
  if (runNow) await runTurn(bot, id);
}

queueButton.addEventListener(
  "click",
  () => void action(() => queuePrompt(false)),
);
composer.addEventListener("submit", (event) => {
  event.preventDefault();
  void action(() => queuePrompt(true));
});

async function start() {
  if (!bridge)
    throw new Error("The desktop connection service is unavailable.");
  bots = await bridge.initialize(restoreConversation());
  const first = bots[0];
  if (first) await selectBot(first);
}

void action(start).then(() => {
  if (activeBot?.provider === "codex") void detectModels();
});
