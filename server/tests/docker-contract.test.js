const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Docker image builds a same-origin frontend and CI gates lint',()=>{
  const root=path.join(__dirname,'../..');
  const docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
  assert.match(docker,/AS client-build/);assert.match(docker,/ARG VITE_API_BASE_URL=\/api/);
  assert.match(docker,/RUN npm run build/);assert.match(docker,/COPY --from=client-build \/client\/dist .\/public/);
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/test.yml'),'utf8');
  assert.match(workflow,/run: npm run lint/);
  assert.match(workflow,/scripts\/package-deployment\.sh/);
  const packaging=fs.readFileSync(path.join(root,'scripts/package-deployment.sh'),'utf8');
  assert.match(packaging,/Dockerfile server\/ client\//);
  assert.match(packaging,/node_modules/);assert.match(packaging,/\.env/);
});
