const { spawnSync } = require('child_process');

const SQL = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ev_mcp_logs' AND column_name = 'data_sid';";
const URL = 'postgres://postgres.kqzkdpmyivtpxkfmibnd:4jTz0PQzBygVMIWY@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require';

const r = spawnSync('/opt/homebrew/bin/psql', [URL, '-c', SQL], {
  encoding: 'utf8', timeout: 15000, stdio: 'pipe'
});

process.stdout.write('S:' + r.status + '\n');
process.stdout.write('O:' + (r.stdout || '') + '\n');
process.stdout.write('E:' + (r.stderr || '') + '\n');