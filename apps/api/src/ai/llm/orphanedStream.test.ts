import { guardUnhandledRejections, isOrphanedStreamError } from './orphanedStream';

const sdkStreamError = () =>
  Object.assign(new Error('[GoogleGenerativeAI Error]: Error reading from the stream'), {
    name: 'GoogleGenerativeAIError',
  });

describe('isOrphanedStreamError', () => {
  it('matches only the Google SDK stream-read failure', () => {
    expect(isOrphanedStreamError(sdkStreamError())).toBe(true);
    expect(
      isOrphanedStreamError(
        Object.assign(new Error('[GoogleGenerativeAI Error]: 429 quota'), {
          name: 'GoogleGenerativeAIError',
        }),
      ),
    ).toBe(false);
    expect(isOrphanedStreamError(new Error('Error reading from the stream'))).toBe(false);
    expect(isOrphanedStreamError('Error reading from the stream')).toBe(false);
  });
});

describe('guardUnhandledRejections', () => {
  const log = { warn: jest.fn(), fatal: jest.fn() };
  const exit = jest.fn();
  let handler: (reason: unknown) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = guardUnhandledRejections(log, exit);
  });
  afterEach(() => {
    process.off('unhandledRejection', handler);
  });

  it('logs an orphaned SDK stream error and keeps the server running', () => {
    handler(sdkStreamError());
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('still exits on any other unhandled rejection, after logging it', () => {
    handler(new Error('database driver bug'));
    expect(log.fatal).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('is registered on the process', () => {
    expect(process.listeners('unhandledRejection')).toContain(handler);
  });
});
