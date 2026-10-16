const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG = '/tmp/ev_mcp_alter_result.txt';
const SQL = 'ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS data_sid TEXT;';
const POOLER_URL = 'postgres://postgres.kqzkdpmyivtpxkfmibnd:4jTz0PQzBygVMIWY@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x';

const r = spawnSync('/opt/homebrew/bin/psql', [POOLER_URL, '-c', SQL], {
  encoding: 'utf8',
  timeout: 15000,
  stdio: 'pipe'
});

let out = '';
out += 'STATUS: ' + r.status + '\n';
out += 'STDOUT: ' + (r.stdout || '(empty)') + '\n';
out += 'STDERR: ' + (r.stderr || '(empty)') + '\n';
if (r.error) out += 'ERROR: ' + r.error.message + '\n';

fs.writeFileSync(LOG, out);
console.log(out);