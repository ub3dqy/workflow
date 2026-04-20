import { validateAdapter } from "../scripts/adapters/agent-adapter.mjs";

const ADAPTER_ERROR_THRESHOLD = 3;
const TERMINAL_STATES = new Set([
  "resolved",
  "failed",
  "stopped",
  "max-iter-exceeded"
]);

export function createOrchestrator({ supervisor, adapter, logger = console }) {
  const validation = validateAdapter(adapter);
  if (!validation.valid) {
    throw new Error(
      `orchestrator: adapter invalid, missing methods: ${validation.missing.join(",")}`
    );
  }

  const adapterErrorCounts = new Map();
  let stopped = false;

  function nextAgent(currentAgent) {
    if (currentAgent === "claude") return "codex";
    if (currentAgent === "codex") return "claude";
    return null;
  }

  function findReplyInPendingIndex(task, state) {
    const expectedTo = task.currentAgent && nextAgent(task.currentAgent);
    if (!expectedTo) {
      return null;
    }

    return state.pendingIndex.find(
      (item) =>
        item.thread === task.thread
        && item.project === task.project
        && item.to === expectedTo
        && item.deliverable === true
        && item.relativePath !== task.lastInboundMessageId
    );
  }

  function recordAdapterError(taskId) {
    const next = (adapterErrorCounts.get(taskId) || 0) + 1;
    adapterErrorCounts.set(taskId, next);
    return next;
  }

  function resetAdapterErrors(taskId) {
    adapterErrorCounts.delete(taskId);
  }

  function handleAdapterFailure(task, error, healthCounters, context) {
    const errCount = recordAdapterError(task.id);
    healthCounters.taskAdapterErrors += 1;
    logger.error(
      `[orchestrator] adapter.${context} failed for task ${task.id} (attempt ${errCount}):`,
      error
    );

    if (errCount >= ADAPTER_ERROR_THRESHOLD) {
      try {
        supervisor.transitionTask(task.id, "failed", {
          error: `adapter.${context} failed ${errCount} consecutive times: ${error && error.message ? error.message : String(error)}`,
          stopReason: "adapter-error-threshold"
        });
        healthCounters.taskTransitions += 1;
        adapterErrorCounts.delete(task.id);
      } catch {
        // Task may already be terminal due to a concurrent stop.
      }
      return { transition: "failed", reason: "adapter-error-threshold" };
    }

    return { error: true, errCount };
  }

  async function handleTaskTick(task, state, healthCounters) {
    if (TERMINAL_STATES.has(task.state)) {
      return { noop: true };
    }

    const maxIterApplicable =
      task.state === "awaiting-reply" || task.state === "handing-off";
    if (maxIterApplicable && task.iterations >= task.maxIterations) {
      supervisor.transitionTask(task.id, "max-iter-exceeded", {
        stopReason: `iterations reached maxIterations=${task.maxIterations}`
      });
      healthCounters.taskTransitions += 1;
      return { transition: "max-iter-exceeded" };
    }

    if (task.state === "pending") {
      try {
        const result = await adapter.launch({
          project: task.project,
          thread: task.thread,
          instruction: task.instruction,
          sessionId: task.sessionIds[task.initialAgent] || undefined
        });
        supervisor.transitionTask(task.id, "launching", {
          currentAgent: task.initialAgent,
          nextAgent: nextAgent(task.initialAgent),
          sessionIds: {
            ...task.sessionIds,
            [task.initialAgent]: result.sessionId
          },
          iterations: task.iterations + 1
        });
        supervisor.transitionTask(task.id, "awaiting-reply");
        healthCounters.taskTransitions += 2;
        resetAdapterErrors(task.id);
        return { transition: "awaiting-reply" };
      } catch (error) {
        return handleAdapterFailure(task, error, healthCounters, "launch");
      }
    }

    if (task.state === "awaiting-reply") {
      if (await supervisor.isThreadResolved({
        thread: task.thread,
        project: task.project,
        since: task.createdAt
      })) {
        supervisor.transitionTask(task.id, "resolved", {
          stopReason: "thread-resolved"
        });
        healthCounters.taskTransitions += 1;
        return { transition: "resolved", reason: "thread-resolved" };
      }

      const reply = findReplyInPendingIndex(task, state);
      if (!reply) {
        return { noop: true, reason: "no-reply-yet" };
      }

      const prevLastInbound = task.lastInboundMessageId;
      supervisor.transitionTask(task.id, "handing-off", {
        lastInboundMessageId: reply.relativePath
      });
      healthCounters.taskTransitions += 1;

      const newCurrent = reply.to;
      const newNext = nextAgent(newCurrent);
      const existingSession = task.sessionIds[newCurrent];
      const isFirstTimeForAgent = !existingSession || existingSession === "";

      try {
        let result;
        let adapterMethod;

        if (isFirstTimeForAgent) {
          adapterMethod = "launch";
          result = await adapter.launch({
            project: task.project,
            thread: task.thread,
            instruction: `Relay from ${reply.from}: ${reply.relativePath}`,
            sessionId: undefined
          });
        } else {
          adapterMethod = "resume";
          result = await adapter.resume({
            sessionId: existingSession,
            message: `New message на thread ${task.thread}: ${reply.relativePath}`
          });
          if (!result.messageAccepted) {
            return handleAdapterFailure(
              task,
              new Error(
                `adapter.resume returned messageAccepted=false for session ${existingSession}`
              ),
              healthCounters,
              "resume"
            );
          }
        }

        supervisor.transitionTask(task.id, "awaiting-reply", {
          currentAgent: newCurrent,
          nextAgent: newNext,
          sessionIds: {
            ...task.sessionIds,
            [newCurrent]: result.sessionId || existingSession
          },
          lastOutboundMessageId: reply.relativePath,
          iterations: task.iterations + 1
        });
        healthCounters.taskTransitions += 1;
        healthCounters.taskCyclesCompleted += 1;
        resetAdapterErrors(task.id);
        return {
          transition: "awaiting-reply",
          iteration: task.iterations + 1,
          adapterMethod
        };
      } catch (error) {
        const errCount = recordAdapterError(task.id);
        healthCounters.taskAdapterErrors += 1;
        logger.error(
          `[orchestrator] handoff adapter failed for task ${task.id} (attempt ${errCount}):`,
          error
        );

        if (errCount >= ADAPTER_ERROR_THRESHOLD) {
          try {
            supervisor.transitionTask(task.id, "failed", {
              error: `adapter handoff failed ${errCount} consecutive times: ${error && error.message ? error.message : String(error)}`,
              stopReason: "adapter-error-threshold"
            });
            healthCounters.taskTransitions += 1;
            adapterErrorCounts.delete(task.id);
          } catch {
            // Task may already be terminal due to a concurrent stop.
          }
          return { transition: "failed", reason: "adapter-error-threshold" };
        }

        try {
          supervisor.transitionTask(task.id, "awaiting-reply", {
            lastInboundMessageId: prevLastInbound
          });
          healthCounters.taskTransitions += 1;
        } catch {
          // Task may already be terminal due to a concurrent stop.
        }
        return { error: true, errCount, reverted: true };
      }
    }

    return { noop: true, reason: `unhandled-state-${task.state}` };
  }

  async function processTick() {
    if (stopped) {
      return { stopped: true };
    }

    const healthCounters = {
      taskTicksProcessed: 0,
      taskTransitions: 0,
      taskCyclesCompleted: 0,
      taskAdapterErrors: 0
    };
    const state = supervisor.state;
    const tasks = supervisor.listTasks({});

    for (const task of tasks) {
      if (TERMINAL_STATES.has(task.state)) {
        continue;
      }

      try {
        await handleTaskTick(task, state, healthCounters);
        healthCounters.taskTicksProcessed += 1;
      } catch (error) {
        logger.error(
          `[orchestrator] unexpected handleTaskTick error for ${task.id}:`,
          error
        );
        healthCounters.taskAdapterErrors += 1;
      }
    }

    const health = supervisor.state.supervisorHealth;
    health.taskTicksProcessed
      = (health.taskTicksProcessed || 0) + healthCounters.taskTicksProcessed;
    health.taskTransitions
      = (health.taskTransitions || 0) + healthCounters.taskTransitions;
    health.taskCyclesCompleted
      = (health.taskCyclesCompleted || 0) + healthCounters.taskCyclesCompleted;
    health.taskAdapterErrors
      = (health.taskAdapterErrors || 0) + healthCounters.taskAdapterErrors;

    return healthCounters;
  }

  function stop() {
    stopped = true;
  }

  return { processTick, stop };
}
