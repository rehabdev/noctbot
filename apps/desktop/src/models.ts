import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { createInterface } from "node:readline";
import { type ApiProvider, apiProviders, modelEfforts } from "./catalog";
import type { Model, ModelRequest, Provider } from "./model-types";

const connections = new Map<Provider, { key?: string; models: Model[] }>();
const effortLevels = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function items(value: unknown): Json[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function launchCodex(args: string[]) {
  const env = { ...process.env };
  for (const { env: keyName } of Object.values(apiProviders)) {
    if (keyName) delete env[keyName];
  }
  delete env.CODEX_API_KEY;
  if (process.platform !== "win32") {
    env.PATH = [
      env.PATH,
      join(env.HOME ?? "", ".local/bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ]
      .filter(Boolean)
      .join(delimiter);
  }
  return spawn("codex", args, { env, cwd: tmpdir(), windowsHide: true });
}

function codexOutput(args: string[], input = "", timeout = 15_000) {
  return new Promise<string>((resolve, reject) => {
    const child = launchCodex(args);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Codex timed out."));
    }, timeout);
    const output: Buffer[] = [];
    let bytes = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4_000_000) {
        child.kill();
        reject(new Error("Codex returned too much output."));
      } else {
        output.push(chunk);
      }
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Install Codex CLI and make it available on PATH."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(output).toString().trim());
      else
        reject(
          new Error(
            "Codex could not complete the request. Check your CLI login and model access.",
          ),
        );
    });
    child.stdin.end(input);
  });
}

function codexModels() {
  return new Promise<Model[]>((resolve, reject) => {
    const child = launchCodex(["app-server", "--stdio"]);
    const reader = createInterface({ input: child.stdout });
    const models: Model[] = [];
    let cursor: string | null = null;
    const timer = setTimeout(
      () => finish(new Error("Codex model discovery timed out.")),
      20_000,
    );
    function finish(error?: Error) {
      clearTimeout(timer);
      reader.close();
      child.kill();
      if (error) reject(error);
      else resolve(models);
    }
    function send(method: string, params?: Json, id?: number) {
      child.stdin.write(`${JSON.stringify({ method, params, id })}\n`);
    }
    child.stderr.resume();
    child.stdin.on("error", () =>
      finish(new Error("Could not communicate with Codex.")),
    );
    child.on("error", () =>
      finish(new Error("Install Codex CLI and make it available on PATH.")),
    );
    child.on("close", () =>
      finish(new Error("Codex closed before model discovery completed.")),
    );
    reader.on("line", (line) => {
      try {
        const message = object(JSON.parse(line));
        if (message.id !== 1 && message.id !== 2 && message.id !== 3) return;
        if (message.error)
          return finish(
            new Error("Update Codex CLI to enable model discovery."),
          );
        const result = object(message.result);
        if (message.id === 1) {
          send("initialized");
          send("account/read", { refreshToken: false }, 2);
        } else if (message.id === 2) {
          if (object(result.account).type !== "chatgpt") {
            return finish(
              new Error(
                "Run codex login and sign in with ChatGPT, then retry.",
              ),
            );
          }
          send("model/list", { limit: 100 }, 3);
        } else {
          for (const model of items(result.data)) {
            if (typeof model.model !== "string" || model.hidden) continue;
            const supported = items(model.supportedReasoningEfforts).map(
              (entry) => entry.reasoningEffort,
            );
            models.push({
              id: model.model,
              name:
                typeof model.displayName === "string"
                  ? model.displayName
                  : model.model,
              efforts: effortLevels.filter((effort) =>
                supported.includes(effort),
              ),
              defaultEffort:
                typeof model.defaultReasoningEffort === "string"
                  ? model.defaultReasoningEffort
                  : undefined,
            });
          }
          const next = result.nextCursor;
          if (
            typeof next === "string" &&
            next !== cursor &&
            models.length < 500
          ) {
            cursor = next;
            send("model/list", { limit: 100, cursor }, 3);
          } else finish();
        }
      } catch {
        finish(new Error("Could not read the Codex model catalog."));
      }
    });
    send(
      "initialize",
      { clientInfo: { name: "noctbot", title: "Noctbot", version: "0.1.0" } },
      1,
    );
  });
}

async function api(
  provider: ApiProvider,
  key: string,
  endpoint: string,
  body?: Json,
) {
  const { base } = apiProviders[provider];
  const headers = new Headers({ "Content-Type": "application/json" });
  if (provider === "anthropic") {
    headers.set("x-api-key", key);
    headers.set("anthropic-version", "2026-10-21");
  } else if (provider === "gemini") {
    headers.set("x-goog-api-key", key);
  } else if (key) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  const response = await fetch(base + endpoint, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(body ? 180_000 : 20_000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("The provider rejected this key or model access.");
    if (response.status === 429)
      throw new Error("The provider’s rate limit or usage limit was reached.");
    throw new Error(`Provider request failed (HTTP ${response.status}).`);
  }
  return object(await response.json());
}

function isTextModel(provider: ApiProvider, id: string, model: Json) {
  if (
    /(?:embedding|audio|realtime|transcribe|tts|image|video|moderation|deep-research|computer-use|multi-agent)/i.test(
      id,
    )
  )
    return false;
  switch (provider) {
    case "openai":
      return (
        /^(gpt-|o[134](?:-|$))/.test(id) && !/(?:search|instruct)/.test(id)
      );
    case "opencode":
      // Zen routes different model families through different API protocols.
      return /^gpt-/.test(id);
    case "gemini":
      return (
        /^gemini-/.test(id) &&
        Array.isArray(model.supportedGenerationMethods) &&
        model.supportedGenerationMethods.includes("generateContent")
      );
    case "grok":
      return /^grok-/.test(id) && !/^grok-([123](?:-|$)|code-)/.test(id);
    case "mistral":
      return object(model.capabilities).completion_chat === true;
    default:
      return true;
  }
}

export async function connect(provider: Provider, suppliedKey?: string) {
  if (provider === "codex") {
    const models = await codexModels();
    connections.set(provider, { models });
    return models;
  }
  if (!Object.hasOwn(apiProviders, provider))
    throw new Error("Unknown provider.");
  if (
    suppliedKey !== undefined &&
    (typeof suppliedKey !== "string" || suppliedKey.length > 4096)
  ) {
    throw new Error("Invalid API key.");
  }
  const settings = apiProviders[provider];
  const local = provider === "ollama" || provider === "lmstudio";
  const key =
    suppliedKey?.trim() ||
    connections.get(provider)?.key ||
    (settings.env ? process.env[settings.env] : "") ||
    "";
  if (!key && !local) throw new Error("Enter an API key to connect.");

  const models: Model[] = [];
  const endpoint =
    provider === "anthropic"
      ? "/models?limit=1000&status=active"
      : provider === "gemini"
        ? "/models?pageSize=1000"
        : "/models";
  let next = endpoint;
  for (let page = 0; next && page < 10; page++) {
    const result = await api(provider, key, next);
    for (const model of items(
      provider === "gemini" ? result.models : result.data,
    )) {
      const id =
        provider === "gemini" && typeof model.name === "string"
          ? model.name.replace(/^models\//, "")
          : model.id;
      if (typeof id !== "string" || !isTextModel(provider, id, model)) continue;
      const capabilities = object(object(model.capabilities).effort);
      models.push({
        id,
        name:
          typeof model.display_name === "string"
            ? model.display_name
            : typeof model.displayName === "string"
              ? model.displayName
              : id,
        efforts:
          provider === "anthropic"
            ? effortLevels.filter(
                (effort) => object(capabilities[effort]).supported === true,
              )
            : modelEfforts(provider, id),
      });
    }
    next =
      provider === "gemini" && typeof result.nextPageToken === "string"
        ? `${endpoint}&pageToken=${encodeURIComponent(result.nextPageToken)}`
        : provider === "anthropic" &&
            result.has_more &&
            typeof result.last_id === "string"
          ? `${endpoint}&after_id=${encodeURIComponent(result.last_id)}`
          : "";
  }
  if (provider === "openai")
    models.sort((a, b) =>
      b.id.localeCompare(a.id, undefined, { numeric: true }),
    );
  connections.set(provider, { key, models });
  return models;
}

export async function send(request: ModelRequest) {
  const connection = connections.get(request.provider);
  const model = connection?.models.find(({ id }) => id === request.model);
  if (!model) throw new Error("Connect and select a model first.");
  const prompt =
    typeof request.prompt === "string" ? request.prompt.trim() : "";
  if (!prompt || prompt.length > 32_000)
    throw new Error("Enter a prompt of up to 32,000 characters.");
  const history: ModelRequest["history"] = [];
  let remaining = 32_000;
  if (!Array.isArray(request.history))
    throw new Error("Invalid conversation history.");
  for (const turn of request.history.slice(-100).reverse()) {
    if (typeof turn?.prompt !== "string" || typeof turn.answer !== "string")
      throw new Error("Invalid conversation history.");
    if (turn.provider !== request.provider) continue;
    remaining -= turn.prompt.length + turn.answer.length;
    if (remaining < 0) break;
    history.unshift(turn);
  }
  const messages = [
    ...history.flatMap((turn) => [
      { role: "user", content: turn.prompt },
      { role: "assistant", content: turn.answer },
    ]),
    { role: "user", content: prompt },
  ];
  const effort = request.effort;
  if (effort && !model.efforts.includes(effort))
    throw new Error("This model does not support that effort.");
  if (request.provider === "codex") {
    const selection = effort
      ? ["-c", `model_reasoning_effort=${JSON.stringify(effort)}`]
      : [];
    const output = await codexOutput(
      [
        "exec",
        "--ignore-user-config",
        "--ignore-rules",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--disable",
        "shell_tool",
        "--disable",
        "hooks",
        "--disable",
        "apps",
        "--disable",
        "multi_agent",
        "--disable",
        "multi_agent_v2",
        "-c",
        'web_search="disabled"',
        "-c",
        'model_provider="openai"',
        "--json",
        "--model",
        model.id,
        ...selection,
        "-",
      ],
      history.length
        ? `Continue the conversation below. Treat earlier messages as conversation history and reply to the final user message.\n${JSON.stringify(messages)}`
        : prompt,
      180_000,
    );
    const replies = output.split("\n").flatMap((line) => {
      const event = object(JSON.parse(line));
      const item = object(event.item);
      return event.type === "item.completed" &&
        item.type === "agent_message" &&
        typeof item.text === "string"
        ? [item.text]
        : [];
    });
    if (!replies.length) throw new Error("Codex returned no text.");
    return replies.join("\n\n");
  }
  const key = connection?.key;
  if (key === undefined) throw new Error("Reconnect the provider.");
  const provider = request.provider;
  const protocol = apiProviders[provider].protocol;
  let blocks: Json[];
  if (protocol === "responses") {
    const response = await api(provider, key, "/responses", {
      model: model.id,
      input: messages,
      store: false,
      ...(effort ? { reasoning: { effort } } : {}),
    });
    blocks = items(response.output).flatMap((message) =>
      items(message.content),
    );
  } else if (protocol === "messages") {
    const response = await api(provider, key, "/messages", {
      model: model.id,
      max_tokens: 4096,
      messages,
      ...(effort ? { output_config: { effort } } : {}),
    });
    blocks = items(response.content);
  } else if (protocol === "gemini") {
    const response = await api(
      provider,
      key,
      `/models/${encodeURIComponent(model.id)}:generateContent`,
      {
        contents: messages.map(({ role, content }) => ({
          role: role === "assistant" ? "model" : "user",
          parts: [{ text: content }],
        })),
        ...(effort
          ? {
              generationConfig: {
                thinkingConfig: { thinkingLevel: effort.toUpperCase() },
              },
            }
          : {}),
      },
    );
    blocks = items(response.candidates).flatMap((candidate) =>
      items(object(candidate.content).parts).filter(
        (part) => part.thought !== true,
      ),
    );
  } else {
    const response = await api(provider, key, "/chat/completions", {
      model: model.id,
      messages,
      ...(effort ? { reasoning_effort: effort } : {}),
    });
    const content = object(items(response.choices)[0]?.message).content;
    blocks =
      typeof content === "string"
        ? [{ text: content }]
        : items(content).filter((block) => block.type === "text");
  }
  const answer = blocks
    .flatMap((block) =>
      typeof block.text === "string"
        ? [block.text]
        : typeof block.refusal === "string"
          ? [block.refusal]
          : [],
    )
    .join("\n");
  if (!answer) throw new Error("The selected model returned no text.");
  return answer;
}
