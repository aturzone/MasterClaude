import type { ServiceConfig } from '@mc-qa/core';

export const serviceConfig: ServiceConfig = {
  id: '__SERVICE__',
  displayName: '__SERVICE__ (__BASEURL__)',
  defaultEnv: 'production.test-account',
  locale: 'en-US',
  timezoneId: 'UTC',
  digitPolicy: 'latin',
  consoleErrorAllowlist: [],
  failedRequestAllowlist: [],
  perfLane: 'lhci',
  expectedFonts: [],
  viewport: { width: 1280, height: 800 },
};

export default serviceConfig;
