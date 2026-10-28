// No session, secret, prompt or channel data is needed to verify readiness.
try {
  const response=await fetch('http://127.0.0.1:4317/healthz',{signal:AbortSignal.timeout(3500),redirect:'error'});
  if(!response.ok||(await response.json()).status!=='ok')process.exitCode=1;
} catch {process.exitCode=1;}
