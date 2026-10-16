const https = require('https');
const URL = 'https://kqzkdpmyivtpxkfmibnd.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxemtkcG15aXZ0cHhrZm1pYm5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc1MjQyOCwiZXhwIjoyMTA0MzI4NDI4fQ.klkabFa-a5fhCVw5sbdN9kPo4iPQ3AsHjRC8NA5QASI';

const req = https.request(URL + '/rest/v1/ev_mcp_logs?limit=1&select=id,data_sid', {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    process.stdout.write('STATUS:' + res.statusCode + '\n');
    process.stdout.write('BODY:' + d.substring(0, 300) + '\n');
  });
});
req.on('error', e => process.stdout.write('ERR:' + e.message + '\n'));
req.end();