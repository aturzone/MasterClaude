import path from 'node:path';
import { defineTaskSuite } from '@mc-qa/runner/playwright';
import { steps } from './steps/steps.ts';

defineTaskSuite({
  serviceDir: path.resolve(import.meta.dirname, '..'),
  steps,
});
