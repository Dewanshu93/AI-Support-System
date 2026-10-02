import { APP_NAME } from '@sd/shared';
import { createApp } from './app';
import { type AppConfig, ConfigError, initConfig, loadDotEnv } from './config';

function startupConfig(): AppConfig {
  loadDotEnv();
  try {
    return initConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\nStartup aborted: configuration error\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

const config = startupConfig();

createApp().listen(config.env.API_PORT, () => {
  console.log(`${APP_NAME} api listening on http://localhost:${config.env.API_PORT}`);
});
