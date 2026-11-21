import type { ChatTurn, Model, Provider } from "./model-types";

export interface Bot {
  id: number;
  name: string;
  color: string;
  provider: Provider;
  model: string;
  effort: string;
  linked_bot_id: number | null;
}

export interface Turn {
  id: number;
  prompt: string;
  answer: string | null;
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  error: string | null;
  source_turn_id: number | null;
}

export interface WorkspaceBridge {
  connect(provider: Provider, key?: string): Promise<Model[]>;
  initialize(legacy: ChatTurn[]): Promise<Bot[]>;
  createBot(name: string, color: string): Promise<Bot>;
  renameBot(id: number, name: string, color: string): Promise<Bot>;
  saveBot(bot: Bot): Promise<void>;
  turns(bot: number): Promise<Turn[]>;
  enqueue(bot: number, prompt: string): Promise<number>;
  run(bot: number, turn: number): Promise<void>;
  cancel(bot: number, turn: number): Promise<void>;
  handoff(bot: number, turn: number): Promise<void>;
  runFlow(bot: number, turn: number, targets: number[]): Promise<void>;
  clear(bot: number): Promise<void>;
}
