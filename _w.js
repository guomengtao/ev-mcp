const u='https://kqzkdpmyivtpxkfmibnd.supabase.co/rest/v1/ev_mcp_logs';
const k='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxemtkcG15aXZ0cHhrZm1pYm5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc1MjQyOCwiZXhwIjoyMTA0MzI4NDI4fQ.klkabFa-a5fhCVw5sbdN9kPo4iPQ3AsHjRC8NA5QASI';
const body=[{project:'guomengtao',role:'user',content:'你好你好',session_id:'S14TY-X7Z9PO',client_name:'trae-ide',status:'ok',created_at:new Date().toISOString()}];
fetch(u,{method:'POST',headers:{apikey:k,Authorization:'Bearer '+k,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(body)})
.then(async r=>{console.log('status',r.status);const d=await r.json();console.log(JSON.stringify(d));})
.catch(e=>console.error('ERR',e.message));