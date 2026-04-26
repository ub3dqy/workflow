#!/usr/bin/env node

import process from "node:process";
import {
  StdioAppServerClient,
  WebSocketAppServerClient
} from "./codex-app-server-client.mjs";

function parseArgs(argv) {
  const args = {
    cwd: process.cwd(),
    clientName: "workflow-app-server-smoke",
    clientVersion: "0.1.0",
    timeoutMs: 20000,
    appServerArgs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--ws-url":
        args.wsUrl = next;
        i += 1;
        break;
      case "--cwd":
        args.cwd = next;
        i += 1;
        break;
      case "--thread-id":
        args.threadId = next;
        i += 1;
        break;
      case "--prompt":
        args.prompt = next;
        i += 1;
        break;
      case "--steer":
        args.steer = next;
        i += 1;
        break;
      case "--timeout-ms":
        args.timeoutMs = Number(next);
        i += 1;
        break;
      case "--list-loaded":
        args.listLoaded = true;
        break;
      case "--client-name":
        args.clientName = next;
        i += 1;
        break;
      case "--client-version":
        args.clientVersion = next;
        i += 1;
        break;
      case "--app-server-arg":
        args.appServerArgs.push(next);
        i += 1;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/codex-app-server-smoke.mjs [options]",
      "",
      "Options:",
      "  --ws-url <ws://127.0.0.1:4501>  Connect to an existing websocket app-server.",
      "  --cwd <path>                     Working directory for new thread/start.",
      "  --thread-id <id>                Use an existing loaded thread instead of creating a new one.",
      "  --prompt <text>                 Send turn/start with this text.",
      "  --steer <text>                  After turn/started, send turn/steer with this text.",
      "  --list-loaded                   Include thread/loaded/list in the output.",
      "  --timeout-ms <n>                Request timeout in milliseconds.",
      "  --client-name <name>            Client name for initialize.",
      "  --client-version <version>      Client version for initialize.",
      "  --app-server-arg <arg>          Extra arg for spawned stdio app-server; repeatable.",
      "",
      "Examples:",
      "  node scripts/codex-app-server-smoke.mjs --list-loaded",
      "  node scripts/codex-app-server-smoke.mjs --prompt 'Reply with OK'",
      "  node scripts/codex-app-server-smoke.mjs --ws-url ws://127.0.0.1:4501 --list-loaded",
      "  node scripts/codex-app-server-smoke.mjs --ws-url ws://127.0.0.1:4501 --thread-id <id> --prompt 'check mailbox' --steer 'do it now'",
      "",
    ].join("\n"),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const client = args.wsUrl
    ? await WebSocketAppServerClient.connect({
        timeoutMs: args.timeoutMs,
        url: args.wsUrl
      })
    : StdioAppServerClient.start({
        timeoutMs: args.timeoutMs,
        cwd: args.cwd,
        appServerArgs: args.appServerArgs
      });

  try {
    const summary = {
      transport: args.wsUrl ? "websocket" : "stdio",
      cwd: args.cwd,
      initialize: await client.initialize({
        clientName: args.clientName,
        clientVersion: args.clientVersion
      })
    };

    client.sendInitialized();

    if (args.listLoaded || args.threadId) {
      summary.loaded = await client.listLoadedThreads({ limit: 50 });
    }

    let threadId = args.threadId;
    if (threadId) {
      const resumed = await client.resumeThread(threadId, { cwd: args.cwd });
      summary.thread = resumed.thread;
      summary.resumed = true;
    }
    if (!threadId && (args.prompt || args.steer || !args.listLoaded)) {
      const started = await client.request("thread/start", {
        cwd: args.cwd,
        sandbox: "danger-full-access",
        approvalPolicy: "never",
      });
      threadId = started.thread.id;
      summary.thread = started.thread;
    }

    if (args.prompt) {
      const turn = await client.startTurn({
        threadId,
        cwd: args.cwd,
        input: [{ type: "text", text: args.prompt }]
      });
      summary.turn = turn.turn;

      if (args.steer) {
        await client.waitForNotification(
          (message) =>
            message.method === "turn/started" &&
            message.params?.turn?.id === turn.turn.id,
        );
        summary.steer = await client.request("turn/steer", {
          threadId,
          expectedTurnId: turn.turn.id,
          input: [{ type: "text", text: args.steer }],
        });
      }
    }

    if (client.stderr?.length) {
      summary.stderr = client.stderr;
    }
    summary.notifications = client.notifications;
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
