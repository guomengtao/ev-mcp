const { spawnSync } = require('child_process');

const SQL = 'ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS data_sid TEXT;';
const URL = 'postgres://postgres.kqzkdpmyivtpxkfmibnd:4jTz0PQzBygVMIWY@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x';

const r = spawnSync('/opt/homebrew/bin/psql', [URL, '-c', SQL], {
  encoding: 'utf8', timeout: 15000, stdio: 'pipe'
});

process.stdout.write('STATUS:' + r.status + '\n');
process.stdout.write('STDOUT:' + (r.stdout || '') + '\n');
process.stdout.write('STDERR:' + (r.stderr || '') + '\n');
if (r.error) process.stdout.write('ERR:' + r.error.message + '\n');