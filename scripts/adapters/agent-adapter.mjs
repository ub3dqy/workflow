/**
 * Agent Adapter Interface — contract для pair Claude Code / Codex CLI / Mock.
 * Implementations must provide all 8 methods below. See:
 *   docs/codex-tasks/paperclip-pivot-adapter-contract-research.md
 *
 * Shape details (JSDoc typedefs follow):
 */

/**
 * @typedef {Object} LaunchArgs
 * @property {string} project
 * @property {string} thread
 * @property {string} instruction
 * @property {string} [sessionId]
 */

/**
 * @typedef {Object} LaunchResult
 * @property {any} processHandle
 * @property {string} sessionId
 * @property {string} launchedAt
 */

/**
 * @typedef {Object} ResumeArgs
 * @property {any} [processHandle]
 * @property {string} sessionId
 * @property {string} message
 */

/**
 * @typedef {Object} ResumeResult
 * @property {boolean} messageAccepted
 * @property {any} processHandle
 * @property {string} sessionId
 */

/**
 * @typedef {Object} ShutdownArgs
 * @property {any} [processHandle]
 * @property {string} [sessionId]
 * @property {boolean} [force]
 */

/**
 * @typedef {Object} ShutdownResult
 * @property {number|null} exitCode
 * @property {string} reason
 */

/**
 * @typedef {Object} IsAliveArgs
 * @property {any} [processHandle]
 * @property {string} [sessionId]
 */

/**
 * @typedef {Object} AttachExistingArgs
 * @property {string} sessionId
 */

/**
 * @typedef {Object} AttachExistingResult
 * @property {any|null} processHandle
 * @property {boolean} attached
 */

/**
 * @typedef {Object} InjectMessageArgs
 * @property {any} [processHandle] - in-memory handle; preferred if still alive
 * @property {string} [sessionId] - fallback persistent identifier (used when processHandle lost across restart/reattach; delegates to resume)
 * @property {string} message
 * @description either processHandle OR sessionId must be provided; if both, processHandle tried first
 */

/**
 * @typedef {Object} InjectMessageResult
 * @property {boolean} injected
 * @property {boolean} fellBackToResume
 */

/**
 * @typedef {Object} ParseCompletionSignalArgs
 * @property {string} recentOutput
 * @property {('text'|'json'|'stream-json')} [outputFormat]
 */

/**
 * @typedef {Object} ParseCompletionSignalResult
 * @property {boolean} completed
 * @property {string} reason
 */

/**
 * @typedef {Object} ClassifyCrashArgs
 * @property {number} exitCode
 * @property {string} stderr
 */

/**
 * @typedef {Object} ClassifyCrashResult
 * @property {('env'|'auth'|'timeout'|'agent-error'|'unknown')} category
 * @property {boolean} retriable
 */

/**
 * @typedef {Object} AgentAdapter
 * @property {(args: LaunchArgs) => Promise<LaunchResult>} launch
 * @property {(args: ResumeArgs) => Promise<ResumeResult>} resume
 * @property {(args: ShutdownArgs) => Promise<ShutdownResult>} shutdown
 * @property {(args: IsAliveArgs) => boolean} isAlive
 * @property {(args: AttachExistingArgs) => Promise<AttachExistingResult>} attachExisting
 * @property {(args: InjectMessageArgs) => Promise<InjectMessageResult>} injectMessage
 * @property {(args: ParseCompletionSignalArgs) => ParseCompletionSignalResult} parseCompletionSignal
 * @property {(args: ClassifyCrashArgs) => ClassifyCrashResult} classifyCrash
 */

export const AGENT_ADAPTER_METHODS = Object.freeze([
  "launch",
  "resume",
  "shutdown",
  "isAlive",
  "attachExisting",
  "injectMessage",
  "parseCompletionSignal",
  "classifyCrash"
]);

/**
 * Validate что candidate object реализует все required methods.
 * Used by orchestrator (P3) + tests.
 * @param {any} candidate
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validateAdapter(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { valid: false, missing: [...AGENT_ADAPTER_METHODS] };
  }

  const missing = AGENT_ADAPTER_METHODS.filter((name) => typeof candidate[name] !== "function");
  return { valid: missing.length === 0, missing };
}
