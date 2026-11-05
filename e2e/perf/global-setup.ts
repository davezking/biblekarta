// Builds the perf sites (build.ts) and serves them for the run: the seeded site on SEEDED_PORT,
// the stress site on STRESS_PORT. Returns the teardown that stops both servers.
import { buildPerfSites, SEEDED_DIR, STRESS_DIR } from './build';
import { serve } from './server';

export const SEEDED_PORT = 4411;
export const STRESS_PORT = 4412;

export default async function globalSetup() {
  await buildPerfSites();
  const servers = await Promise.all([
    serve(SEEDED_DIR, SEEDED_PORT),
    serve(STRESS_DIR, STRESS_PORT),
  ]);
  return async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  };
}
