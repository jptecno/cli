import { exec, execFile, execSync, spawn } from 'node:child_process';

const userCommand = process.argv[2];

// ruleid: unsafe-child-process-exec
exec(userCommand);

// ruleid: unsafe-child-process-exec
execSync(`npm ${userCommand}`);

// ok: unsafe-child-process-exec
exec('npm run check');

// ok: unsafe-child-process-exec
execSync('npm run check');

// ok: unsafe-child-process-exec
execFile('npm', ['run', 'check']);

// ok: unsafe-child-process-exec
spawn('npm', ['run', 'check'], { shell: false });
