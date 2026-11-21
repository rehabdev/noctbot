export const apiProviders = {
  openai: {
    base: "https://api.openai.com/v1",
    env: "OPENAI_API_KEY",
    protocol: "responses",
  },
  anthropic: {
    base: "https://api.anthropic.com/v1",
    env: "ANTHROPIC_API_KEY",
    protocol: "messages",
  },
  grok: {
    base: "https://api.x.ai/v1",
    env: "XAI_API_KEY",
    protocol: "responses",
  },
  gemini: {
    base: "https://generativelanguage.googleapis.com/v1beta",
    env: "GEMINI_API_KEY",
    protocol: "gemini",
  },
  kimi: {
    base: "https://api.moonshot.ai/v1",
    env: "MOONSHOT_API_KEY",
    protocol: "chat",
  },
  mistral: {
    base: "https://api.mistral.ai/v1",
    env: "MISTRAL_API_KEY",
    protocol: "chat",
  },
  opencode: {
    base: "https://opencode.ai/zen/v1",
    env: "OPENCODE_API_KEY",
    protocol: "responses",
  },
  ollama: { base: "http://127.0.0.1:11434/v1", env: null, protocol: "chat" },
  lmstudio: {
    base: "http://127.0.0.1:1234/v1",
    env: "LM_STUDIO_API_TOKEN",
    protocol: "chat",
  },
} as const;

export type ApiProvider = keyof typeof apiProviders;

const standard = ["low", "medium", "high"] as const;
const extended = [...standard, "xhigh", "max"];

const documentedEfforts: Partial<
  Record<ApiProvider, Record<string, readonly string[]>>
> = {
  openai: {
    "gpt-6.2-astra": extended,
    "gpt-6.2-sol": extended,
    "gpt-6-astra": extended,
    "gpt-6.1-sol": extended,
    "gpt-6.1-terra": ["none", ...extended],
    "gpt-6-sol": ["none", ...extended],
    "gpt-6-luna": ["none", ...extended],
    "gpt-5.5": ["none", ...standard, "xhigh"],
    "gpt-5.4": ["none", ...standard, "xhigh"],
    o3: standard,
    "o4-mini": standard,
  },
  grok: {
    "grok-4.5": standard,
    "grok-4.6": [...standard, "xhigh"],
    "grok-4.7": [...standard, "xhigh"],
  },
  gemini: {
    "gemini-3-pro-preview": ["low", "high"],
    "gemini-3.1-pro-preview": standard,
    "gemini-3-flash-preview": ["minimal", ...standard],
    "gemini-3.1-flash-lite": ["minimal", ...standard],
    "gemini-3.1-flash-lite-preview": ["minimal", ...standard],
  },
  kimi: {
    "kimi-k3": ["low", "high", "max"],
  },
  mistral: {
    "mistral-small-2603": ["none", "high"],
    "mistral-medium-3-5": ["none", "high"],
    "mistral-large-4": standard,
    "mistral-large-4-0": standard,
    "zai-glm-5-3": ["low", "high", "max"],
    "zai-glm-5-3-flash": ["low", "high", "max"],
  },
};

export function modelEfforts(provider: ApiProvider, id: string) {
  const catalog =
    documentedEfforts[provider === "opencode" ? "openai" : provider];
  const snapshotBase = id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return [
    ...(catalog && Object.hasOwn(catalog, snapshotBase)
      ? (catalog[snapshotBase] ?? [])
      : []),
  ];
}
