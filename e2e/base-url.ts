/**
 * Origin used by the Playwright suite. Kept in one place so the config and the
 * specs agree on what counts as a same-origin request.
 */
export const E2E_PORT = 4173;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
