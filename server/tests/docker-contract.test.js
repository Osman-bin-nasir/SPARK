const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Docker image builds a same-origin frontend and CI gates lint',()=>{
  const root=path.join(__dirname,'../..');
  const docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
  assert.match(docker,/AS client-build/);assert.match(docker,/ARG VITE_API_BASE_URL=\/api/);
  assert.match(docker,/RUN npm run build/);assert.match(docker,/COPY --from=client-build \/client\/dist .\/public/);
  assert.match(fs.readFileSync(path.join(root,'.github/workflows/test.yml'),'utf8'),/run: npm run lint/);
});
