import { spawn } from "node:child_process";

export class AppServerRpcClient {
  constructor({
    timeoutMs = 20000,
    sendMessage,
    closeTransport = async () => {},
    transportName = "custom"
  }) {
    if (typeof sendMessage !== "function") {
      throw new TypeError("sendMessage function is required");
    }

    this.timeoutMs = timeoutMs;
    this.sendMessage = sendMessage;
    this.closeTransport = closeTransport;
    this.transportName = transportName;
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.watchers = [];
    this.closed = false;
  }

  send(message) {
    if (this.closed) {
      throw new Error("app-server client is closed");
    }
    this.sendMessage(message);
  }

  handleMessage(message) {
    if (message?.id !== undefined) {
      this.resolveResponse(message);
      return;
    }
    this.rememberNotification(message);
  }

  rememberNotification(message) {
    this.notifications.push(message);
    if (this.notifications.length > 200) {
      this.notifications.shift();
    }
    for (const watcher of [...this.watchers]) {
      watcher(message);
    }
  }

  resolveResponse(message) {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      const errorPayload = message.error;
      const error = new Error(
        typeof errorPayload === "string"
          ? errorPayload
          : errorPayload?.message || JSON.stringify(errorPayload)
      );
      if (errorPayload && typeof errorPayload === "object") {
        error.code = Number.isFinite(errorPayload.code) ? errorPayload.code : null;
        error.data = errorPayload.data;
        error.rpcError = errorPayload;
      }
      pending.reject(error);
      return;
    }
    pending.resolve(message.result);
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  waitForNotification(predicate, timeoutMs = this.timeoutMs) {
    return new Promise((resolve, reject) => {
      const existing = this.notifications.find(predicate);
      if (existing) {
        resolve(existing);
        return;
      }
      const watcher = (message) => {
        if (!predicate(message)) {
          return;
        }
        clearTimeout(timer);
        this.watchers = this.watchers.filter((item) => item !== watcher);
        resolve(message);
      };
      const timer = setTimeout(() => {
        this.watchers = this.watchers.filter((item) => item !== watcher);
        reject(new Error("timeout waiting for notification"));
      }, timeoutMs);
      this.watchers.push(watcher);
    });
  }

  async initialize({ clientName, clientVersion, experimentalApi = false }) {
    const params = {
      clientInfo: {
        name: clientName,
        version: clientVersion
      }
    };

    if (experimentalApi) {
      params.capabilities = { experimentalApi: true };
    }

    return this.request("initialize", params);
  }

  sendInitialized() {
    this.send({ method: "initialized" });
  }

  listLoadedThreads(params = { limit: 50 }) {
    return this.request("thread/loaded/list", params);
  }

  readThread(threadId, params = {}) {
    return this.request("thread/read", {
      threadId,
      ...params
    });
  }

  resumeThread(threadId, params = {}) {
    return this.request("thread/resume", {
      threadId,
      ...params
    });
  }

  startThread(params = {}) {
    return this.request("thread/start", params);
  }

  startTurn({ threadId, cwd, input }) {
    return this.request("turn/start", {
      threadId,
      cwd,
      input
    });
  }

  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`client closed before response ${id}`));
    }
    this.pending.clear();
    this.watchers = [];
    await this.closeTransport();
  }
}

export class WebSocketAppServerClient extends AppServerRpcClient {
  static async connect({ url, timeoutMs = 20000 }) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout connecting to ${url}`));
      }, timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`websocket connect failed: ${url}`));
      }, { once: true });
    });

    const client = new WebSocketAppServerClient({
      timeoutMs,
      sendMessage: (message) => {
        socket.send(JSON.stringify(message));
      },
      closeTransport: async () => {
        socket.close();
      },
      transportName: "websocket"
    });
    client.socket = socket;
    socket.addEventListener("message", (event) => {
      client.handleMessage(JSON.parse(event.data.toString()));
    });
    return client;
  }
}

export class StdioAppServerClient extends AppServerRpcClient {
  static start({ timeoutMs = 20000, cwd = process.cwd(), appServerArgs = [] }) {
    const child = spawn("codex", ["app-server", ...appServerArgs], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stderr = [];
    let buffer = "";

    const client = new StdioAppServerClient({
      timeoutMs,
      sendMessage: (message) => {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      },
      closeTransport: async () => {
        if (child.exitCode !== null) {
          return;
        }
        child.kill("SIGTERM");
        await new Promise((resolve) => {
          child.once("exit", resolve);
          setTimeout(resolve, 1000);
        });
      },
      transportName: "stdio"
    });
    client.child = child;
    client.stderr = stderr;

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      while (true) {
        const index = buffer.indexOf("\n");
        if (index === -1) {
          break;
        }
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) {
          continue;
        }
        client.handleMessage(JSON.parse(line));
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr.push(chunk.toString().trimEnd());
      if (stderr.length > 200) {
        stderr.shift();
      }
    });

    return client;
  }
}
