import * as childProcess from 'node:child_process';
import childProcessDefault, {
  exec,
  execFile,
  execSync,
  exec as run,
  spawn,
} from 'node:child_process';

const userCommand = process.argv[2];

// ruleid: unsafe-child-process-exec
exec(userCommand);

// ruleid: unsafe-child-process-exec
execSync(`npm ${userCommand}`);

// ruleid: unsafe-child-process-exec
run(userCommand);

// ruleid: unsafe-child-process-exec
childProcess.exec(userCommand);

// ruleid: unsafe-child-process-exec
childProcess.execSync(`npm ${userCommand}`);

// ruleid: unsafe-child-process-exec
childProcessDefault.exec(userCommand);

// ok: unsafe-child-process-exec
exec('npm run check');

// ok: unsafe-child-process-exec
execSync('npm run check');

// ok: unsafe-child-process-exec
run('npm run check');

// ok: unsafe-child-process-exec
childProcess.exec('npm run check');

// ok: unsafe-child-process-exec
childProcessDefault.execSync('npm run check');

// ok: unsafe-child-process-exec
execFile('npm', ['run', 'check']);

// ok: unsafe-child-process-exec
spawn('npm', ['run', 'check'], { shell: false });
