import type { ApiProvider } from "./catalog";

export type Provider = "codex" | ApiProvider;

export interface Model {
  id: string;
  name: string;
  efforts: string[];
  defaultEffort?: string;
}

export interface ModelRequest {
  provider: Provider;
  model: string;
  effort: string;
  prompt: string;
  history: ChatTurn[];
}

export interface ChatTurn {
  provider?: Provider;
  prompt: string;
  answer: string;
}
