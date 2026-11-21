# Desktop app

Start from the repository root with `bun run dev --filter=@noctbot/desktop`.

- **ChatGPT** uses the local Codex CLI. Run `codex login` in a terminal and choose ChatGPT sign-in, then select **Detect models**.
- **OpenAI API** and **Claude API** accept personal API keys in the app or through `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` when launching the desktop workspace directly. API keys entered in the app are kept in memory for the session. API usage is billed separately.
- **Claude subscriptions** can be used directly in the official Claude Code CLI. Noctbot uses Claude Console API keys for Claude requests in the app.

The Codex catalog is discovered from the CLI and can contain models that the signed-in account cannot run. The effort slider offers the model default and any supported levels known to the client.

The **Connection** menu also supports Grok, Gemini, Kimi, Mistral, and OpenCode Zen (GPT models through Responses) with their API keys. Ollama and LM Studio use their local servers on ports 11434 and 1234. Model effort levels come from provider metadata where available or documented per-model settings. Other models use the provider default.

The bot rail holds named color circles. Use **+** to create a bot and **Edit** to change its name or color. Each bot has its own saved provider, model, effort, and conversation. API keys entered into the app are held in memory for the session.

**Send** saves a prompt to the bot’s queue and attempts to run it. **Queue** saves it for later. Use **Run**, **Retry**, or **Cancel** on a saved turn. If the app closes during a request, that turn is marked interrupted on reopening and can be retried explicitly.

Use **Send replies to** to link a recipient bot. **Queue for [bot]** sends a copy of a completed reply to the recipient’s local queue. Open the recipient bot and click **Run** to send that text to its provider. The linked bot receives only the selected reply and its own eligible chat history. **Run linked flow** previews the provider and model for each destination, then runs the linked bots in order after confirmation. Flows are limited to four distinct destinations and stop on failure.

Profiles, links and turns live in `workspace.sqlite` in Electron’s app data folder. The app imports existing local chats once and keeps them separate by their recorded provider. Requests replay recent completed turns from the same bot and provider, up to 32,000 characters. **New chat** clears the selected bot’s turns after confirmation.

OpenBot's native agent runtimes and arbitrary ACP commands are outside this chat integration. Noctbot does not install provider CLIs or expose local execution tools through its API connections.

Provider marks are from [Lobe Icons](https://github.com/lobehub/lobe-icons), under the included MIT license.
