import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)));
const projectId = serviceAccount.project_id;

const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const client = await auth.getClient();

async function api(url, opts) {
  const res = await client.request({ url, ...opts });
  return res.data;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let list = await api(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`);

if (!list?.apps?.length) {
  const op = await api(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
    method: 'POST',
    data: { displayName: 'BookFinder Dashboard' },
  });

  let done = false;
  let result = null;
  for (let i = 0; i < 20 && !done; i++) {
    await sleep(2000);
    const status = await api(`https://firebase.googleapis.com/v1beta1/${op.name}`);
    done = status.done;
    if (done) result = status.response;
  }

  if (!result) throw new Error('Timed out waiting for web app creation');
  console.log('Created app:', JSON.stringify(result, null, 2));
  list = { apps: [result] };
}

const appId = list.apps[0].appId;
const config = await api(
  `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${appId}/config`
);
console.log('CONFIG_JSON_START');
console.log(JSON.stringify(config, null, 2));
console.log('CONFIG_JSON_END');
