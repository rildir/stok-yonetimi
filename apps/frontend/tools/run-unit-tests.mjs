// Runs the frontend unit tests (@angular/build:unit-test, Vitest) through `nx run frontend:unit-test`.
//
// Why a wrapper: on Windows the workspace root can reach the builder with a lower-case drive letter
// (e.g. NX_WORKSPACE_ROOT_PATH=c:\... set by VS Code terminals) while Node resolves `vitest` from
// C:\...\node_modules. Node's ESM loader then holds two module instances of vitest (file:///c:/ and
// file:///C:/), and every spec fails with "Vitest failed to find the runner". Normalizing the drive
// letter before Nx computes the workspace root keeps one instance. Other platforms are unaffected.
import { spawnSync } from 'node:child_process';

const upperDrive = (p) => (p && /^[a-z]:[\\/]/.test(p) ? p[0].toUpperCase() + p.slice(1) : p);
const env = { ...process.env };
const cwd = upperDrive(process.cwd());
for (const k of ['NX_WORKSPACE_ROOT_PATH', 'NX_WORKSPACE_ROOT', 'INIT_CWD']) if (env[k]) env[k] = upperDrive(env[k]);
if (process.platform === 'win32') {
  env.NX_WORKSPACE_ROOT_PATH = env.NX_WORKSPACE_ROOT_PATH || cwd;
  env.NX_DAEMON = 'false'; // a running daemon may still carry the lower-case root
}

const args = ['nx', 'run', 'frontend:unit-test', ...process.argv.slice(2)];
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
