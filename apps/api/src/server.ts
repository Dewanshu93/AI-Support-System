import { APP_NAME } from '@sd/shared';
import { createApp } from './app';
import { type AppConfig, ConfigError, initConfig, loadDotEnv } from './config';
import { logger } from './lib/logger';

function startupConfig(): AppConfig {
  loadDotEnv();
  try {
    return initConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // Plain stderr, not JSON: this message is read by a person fixing their setup.
      console.error(`\nStartup aborted: configuration error\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

const config = startupConfig();
logger.level = config.env.LOG_LEVEL;

createApp().listen(config.env.API_PORT, () => {
  logger.info(
    { port: config.env.API_PORT, nodeEnv: config.env.NODE_ENV },
    `${APP_NAME} api listening`,
  );
});
