// The Google Generative AI SDK keeps an internal promise for the whole streamed
// response. When the stream breaks (network reset, provider drop, our timeout
// aborting it), that promise rejects with nobody listening, while the turn
// itself already received the same failure through the stream iterator and
// reported it (error event, retryable). Node treats an unhandled rejection as
// fatal, so one broken stream would stop the API for every user. The server
// logs these and carries on; any other unhandled rejection still exits.

/** True for the SDK's orphaned "Error reading from the stream" rejection. */
export function isOrphanedStreamError(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    reason.name === 'GoogleGenerativeAIError' &&
    reason.message.includes('Error reading from the stream')
  );
}

/**
 * Installs the process handler: orphaned SDK stream errors are logged as
 * warnings; anything else is logged as fatal and exits with code 1 (Node's
 * default behaviour, with a log line first).
 */
export function guardUnhandledRejections(
  log: {
    warn(obj: object, msg: string): void;
    fatal(obj: object, msg: string): void;
  },
  exit: (code: number) => void = (code) => process.exit(code),
): (reason: unknown) => void {
  const handler = (reason: unknown) => {
    if (isOrphanedStreamError(reason)) {
      log.warn({ err: reason }, 'LLM stream failed after its turn had already handled the error');
      return;
    }
    log.fatal({ err: reason }, 'unhandled promise rejection');
    exit(1);
  };
  process.on('unhandledRejection', handler);
  return handler;
}
