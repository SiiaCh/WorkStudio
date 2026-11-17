import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(origins: string, code: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://placeholder:placeholder@localhost/workstudio_db",
      JWT_SECRET: "cors-test-only-secret-".repeat(4), MOCK_PAYMENTS_ENABLED: "false", EMAIL_TRANSPORT: "preview",
      PUBLIC_API_URL: "https://api.example.com", CORS_ORIGINS: origins, TRUST_PROXY_HOPS: "1", TLS_CERT_PATH: "", TLS_KEY_PATH: "" },
    encoding: "utf8", windowsHide: true, timeout: 20000,
  });
}
test("production CORS permits exact local HTTP hosts and HTTPS, rejecting other HTTP and malformed origins", () => {
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173", "https://example.com", "http://localhost:5173, http://127.0.0.1:5173,https://example.com"]) {
    const r = run(origin, "await import('./src/config/env.ts')"); assert.equal(r.status, 0, r.stderr);
  }
  for (const origin of ["http://example.com", "http://localhost.example.com:5173", "http://127.0.0.2:5173", "http://[::1]:5173", "*", "http://localhost:5173/path", "http://user@localhost:5173"]) {
    const r = run(origin, "await import('./src/config/env.ts')"); assert.notEqual(r.status, 0); assert.match(r.stderr, /CORS_ORIGINS/);
  }
});
test("production OPTIONS reflects only allowlisted origins and preserves allowed methods and headers", () => {
  const r = run("http://localhost:5173, http://127.0.0.1:5173,https://example.com", `
    import assert from 'node:assert/strict';
    const {app} = await import('./src/app.ts');
    const {prisma} = await import('./src/db/prisma.ts');
    const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
    try {
      for(const origin of ['http://localhost:5173','http://127.0.0.1:5173','https://example.com','http://localhost:5174','https://unlisted.example.com']) {
        const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/login', {method:'OPTIONS',headers:{Origin:origin,'X-Forwarded-Proto':'https','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization,idempotency-key'}});
        const allowed=['http://localhost:5173','http://127.0.0.1:5173','https://example.com'].includes(origin);
        assert.equal(response.status,allowed?204:403);
        assert.equal(response.headers.get('access-control-allow-origin'),allowed?origin:null);
        if(allowed){assert.match(response.headers.get('vary'),/Origin/);assert.match(response.headers.get('access-control-allow-methods'),/POST/);for(const h of ['Content-Type','Authorization','Idempotency-Key']) assert.ok(response.headers.get('access-control-allow-headers').includes(h));assert.equal(response.headers.get('access-control-allow-credentials'),null);}
      }
    } finally {await new Promise(r=>server.close(r));await prisma.$disconnect();}
  `);
  assert.equal(r.status,0,r.stderr);
});
