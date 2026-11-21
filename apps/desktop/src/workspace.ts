import { DatabaseSync } from "node:sqlite";
import { ipcMain } from "electron";
import { apiProviders } from "./catalog";
import type { ChatTurn, Provider } from "./model-types";
import { connect, send } from "./models";
import type { Bot, Turn } from "./workspace-types";

export function registerWorkspace(pageUrl: string, filename: string) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS bots (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'codex',
      model TEXT NOT NULL DEFAULT '',
      effort TEXT NOT NULL DEFAULT '',
      linked_bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
      CHECK (linked_bot_id IS NULL OR linked_bot_id != id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY,
      bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT,
      state TEXT NOT NULL DEFAULT 'queued'
        CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
      error TEXT,
      source_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS turns_bot ON turns(bot_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS one_running_per_bot ON turns(bot_id) WHERE state='running';
    CREATE UNIQUE INDEX IF NOT EXISTS one_handoff_per_target ON turns(bot_id, source_turn_id);
    CREATE TABLE IF NOT EXISTS workspace_meta (key TEXT PRIMARY KEY) STRICT;
    UPDATE turns SET state='failed', error='Interrupted when the app closed. Retry to run again.' WHERE state='running';
  `);

  function transaction<T>(write: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = write();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function listBots() {
    return db
      .prepare("SELECT * FROM bots ORDER BY id")
      .all() as unknown as Bot[];
  }

  function getBot(id: number) {
    const bot = db
      .prepare("SELECT * FROM bots WHERE id=?")
      .get(id) as unknown as Bot | undefined;
    if (!bot) throw new Error("Bot not found.");
    return bot;
  }

  function validateAppearance(name: string, color: string) {
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 48 ||
      typeof color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(color)
    ) {
      throw new Error(
        "Enter a name of up to 48 characters and choose a color.",
      );
    }
  }

  function createBot(name: string, color: string) {
    validateAppearance(name, color);
    return getBot(
      Number(
        db
          .prepare("INSERT INTO bots(name,color) VALUES (?,?)")
          .run(name.trim(), color).lastInsertRowid,
      ),
    );
  }

  function renameBot(id: number, name: string, color: string) {
    validateAppearance(name, color);
    db.prepare("UPDATE bots SET name=?, color=? WHERE id=?").run(
      name.trim(),
      color,
      id,
    );
    return getBot(id);
  }

  function isProvider(value: unknown): value is Provider {
    return (
      typeof value === "string" &&
      (value === "codex" || Object.hasOwn(apiProviders, value))
    );
  }

  function initialize(legacy: ChatTurn[]) {
    return transaction(() => {
      if (
        db
          .prepare(
            "INSERT OR IGNORE INTO workspace_meta VALUES ('legacy-imported')",
          )
          .run().changes
      ) {
        const ids = new Map<string, number>();
        const add = db.prepare(
          "INSERT INTO turns(bot_id,provider,prompt,answer,state) VALUES (?,?,?,?,'completed')",
        );
        for (const turn of Array.isArray(legacy) ? legacy.slice(-100) : []) {
          if (
            typeof turn?.prompt !== "string" ||
            typeof turn.answer !== "string"
          )
            continue;
          const source = isProvider(turn.provider) ? turn.provider : "legacy";
          let id = ids.get(source);
          if (id === undefined) {
            const bot = createBot(
              source === "legacy"
                ? "Previous chats"
                : `Previous chats · ${source}`,
              "#FF884C",
            );
            id = bot.id;
            ids.set(source, id);
            if (source !== "legacy")
              db.prepare("UPDATE bots SET provider=? WHERE id=?").run(
                source,
                id,
              );
          }
          add.run(
            id,
            source,
            turn.prompt.slice(0, 32_000),
            turn.answer.slice(0, 128_000),
          );
        }
      }
      if (!listBots().length) createBot("Noctbot", "#FF884C");
      return listBots();
    });
  }

  function saveBot(bot: Bot) {
    getBot(bot.id);
    if (
      !isProvider(bot.provider) ||
      typeof bot.model !== "string" ||
      bot.model.length > 256 ||
      typeof bot.effort !== "string" ||
      bot.effort.length > 12
    ) {
      throw new Error("Invalid model settings.");
    }
    if (bot.linked_bot_id !== null) getBot(bot.linked_bot_id);
    db.prepare(
      "UPDATE bots SET provider=?, model=?, effort=?, linked_bot_id=? WHERE id=?",
    ).run(bot.provider, bot.model, bot.effort, bot.linked_bot_id, bot.id);
  }

  function turns(botId: number) {
    return db
      .prepare(
        "SELECT * FROM (SELECT * FROM turns WHERE bot_id=? ORDER BY id DESC LIMIT 200) ORDER BY id",
      )
      .all(botId) as unknown as Turn[];
  }

  function enqueue(botId: number, input: string) {
    const bot = getBot(botId);
    const prompt = typeof input === "string" ? input.trim() : "";
    if (!prompt || prompt.length > 32_000)
      throw new Error("Enter a prompt of up to 32,000 characters.");
    return Number(
      db
        .prepare("INSERT INTO turns(bot_id,provider,prompt) VALUES (?,?,?)")
        .run(bot.id, bot.provider, prompt).lastInsertRowid,
    );
  }

  async function run(botId: number, turnId: number) {
    const bot = getBot(botId);
    const turn = db
      .prepare("SELECT * FROM turns WHERE id=? AND bot_id=?")
      .get(turnId, botId) as unknown as
      | (Turn & { provider: string })
      | undefined;
    if (!turn || !["failed", "queued"].includes(turn.state))
      throw new Error("This turn is no longer queued.");
    if (turn.provider !== bot.provider)
      throw new Error("Select the provider this turn was queued for.");
    if (!bot.model) throw new Error("Connect and select a model for this bot.");
    if (
      db
        .prepare("SELECT 1 FROM turns WHERE bot_id=? AND state='running'")
        .get(botId)
    ) {
      throw new Error("This bot already has a running turn.");
    }
    if (
      db
        .prepare(
          "SELECT 1 FROM turns WHERE bot_id=? AND state='queued' AND id<?",
        )
        .get(botId, turnId)
    ) {
      throw new Error("Run or cancel earlier queued turns first.");
    }
    db.prepare("UPDATE turns SET state='running', error=NULL WHERE id=?").run(
      turnId,
    );
    try {
      const history = db
        .prepare(
          "SELECT provider,prompt,answer FROM turns WHERE bot_id=? AND provider=? AND state='completed' AND id<? ORDER BY id DESC LIMIT 100",
        )
        .all(botId, bot.provider, turnId)
        .reverse() as unknown as ChatTurn[];
      const answer = await send({
        provider: bot.provider,
        model: bot.model,
        effort: bot.effort,
        prompt: turn.prompt,
        history,
      });
      db.prepare("UPDATE turns SET state='completed', answer=? WHERE id=?").run(
        answer,
        turnId,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Provider request failed.";
      db.prepare("UPDATE turns SET state='failed', error=? WHERE id=?").run(
        message.slice(0, 500),
        turnId,
      );
    }
  }

  function handoff(sourceId: number, turnId: number) {
    const source = getBot(sourceId);
    if (source.linked_bot_id === null)
      throw new Error("Link a recipient bot first.");
    const target = getBot(source.linked_bot_id);
    const turn = db
      .prepare(
        "SELECT * FROM turns WHERE id=? AND bot_id=? AND state='completed'",
      )
      .get(turnId, sourceId) as unknown as Turn | undefined;
    if (!turn?.answer) throw new Error("Select a completed reply.");
    const prefix = `Handoff from ${source.name}. Review this reply and provide your own response.\n\n`;
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO turns(bot_id,provider,prompt,source_turn_id) VALUES (?,?,?,?)`,
      )
      .run(
        target.id,
        target.provider,
        prefix + turn.answer.slice(0, 32_000 - prefix.length),
        turnId,
      );
    if (!inserted.changes)
      throw new Error("This reply was already queued for the linked bot.");
    return Number(inserted.lastInsertRowid);
  }

  async function runFlow(
    sourceId: number,
    sourceTurn: number,
    targets: number[],
  ) {
    if (
      !Array.isArray(targets) ||
      targets.length < 1 ||
      targets.length > 4 ||
      new Set([sourceId, ...targets]).size !== targets.length + 1
    ) {
      throw new Error("A flow can run up to four distinct linked bots.");
    }
    let current = getBot(sourceId);
    for (const id of targets) {
      if (current.linked_bot_id !== id)
        throw new Error("The flow links changed.");
      current = getBot(id);
      if (!current.model)
        throw new Error(
          `Select a model for ${current.name} before running the flow.`,
        );
      if (
        db
          .prepare(
            "SELECT 1 FROM turns WHERE bot_id=? AND state IN ('queued','running')",
          )
          .get(id)
      ) {
        throw new Error(
          `Run or cancel the pending work for ${current.name} first.`,
        );
      }
    }

    let from = sourceId;
    let completed = sourceTurn;
    for (const target of targets) {
      if (getBot(from).linked_bot_id !== target)
        throw new Error("The flow links changed.");
      const queued = handoff(from, completed);
      await run(target, queued);
      const result = db
        .prepare("SELECT state FROM turns WHERE id=?")
        .get(queued);
      if (result?.state !== "completed")
        throw new Error(
          `The flow stopped at ${getBot(target).name}. Open that bot to review the failed turn.`,
        );
      from = target;
      completed = queued;
    }
  }

  function cancel(bot: number, turn: number) {
    db.prepare(
      "UPDATE turns SET state='cancelled', error=NULL WHERE bot_id=? AND id=? AND state IN ('queued','failed')",
    ).run(bot, turn);
  }

  function clear(bot: number) {
    if (
      db
        .prepare("SELECT 1 FROM turns WHERE bot_id=? AND state='running'")
        .get(bot)
    )
      throw new Error("Wait for the running turn before clearing this chat.");
    db.prepare("DELETE FROM turns WHERE bot_id=?").run(bot);
  }

  const operations = {
    connect,
    initialize,
    createBot,
    renameBot,
    saveBot,
    turns,
    enqueue,
    run,
    cancel,
    handoff,
    runFlow,
    clear,
  };
  for (const [name, operation] of Object.entries(operations)) {
    ipcMain.handle(`workspace:${name}`, (event, ...args: unknown[]) => {
      if (event.senderFrame?.url !== pageUrl)
        throw new Error("Untrusted request.");
      return (operation as (...values: unknown[]) => unknown)(...args);
    });
  }
}
