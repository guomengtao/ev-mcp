const { spawnSync } = require('child_process');

const SQL = 'ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS data_sid TEXT;';
const URL = 'postgres://postgres.kqzkdpmyivtpxkfmibnd:4jTz0PQzBygVMIWY@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require';

const r = spawnSync('/opt/homebrew/bin/psql', [URL, '-c', SQL], {
  encoding: 'utf8', timeout: 15000, stdio: 'pipe'
});

process.stdout.write('S:' + r.status + '\n');
process.stdout.write('O:' + (r.stdout || '') + '\n');
process.stdout.write('E:' + (r.stderr || '') + '\n');
if (r.error) process.stdout.write('ERR:' + r.error.message + '\n');