import { defineServiceConfig } from '@mc-qa/runner/playwright';
import { serviceConfig } from './service.config.ts';

export default defineServiceConfig(import.meta.dirname, serviceConfig);
