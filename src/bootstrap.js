import { activateConfig, loadRuntimeConfig } from './runtime/config.js';
import { renderConfigError } from './runtime/ConfigErrorScreen.jsx';

async function bootstrap() {
  try {
    const config = await loadRuntimeConfig();
    await activateConfig(config, { source: config?.source || 'api', orgId: config?.orgId ?? null });
    const { renderApp } = await import('./main.jsx');
    renderApp(config);
  } catch (error) {
    renderConfigError(error);
  }
}

bootstrap();
