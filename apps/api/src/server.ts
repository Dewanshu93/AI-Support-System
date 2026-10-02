import { APP_NAME } from '@sd/shared';
import { createApp } from './app';

const port = Number(process.env.API_PORT ?? 4000);

createApp().listen(port, () => {
  console.log(`${APP_NAME} api listening on http://localhost:${port}`);
});
