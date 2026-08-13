import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const serviceAccount = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url)));
const projectId = serviceAccount.project_id;

const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const client = await auth.getClient();

const rulesSource = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /books/{bookId} {
      allow read: if true;
      allow write: if false;
    }
    match /scanEvents/{eventId} {
      allow read: if true;
      allow write: if false;
    }
    match /shelfMap/{readerId} {
      allow read: if true;
      allow write: if false;
    }
    match /placementAlerts/{alertId} {
      allow read: if true;
      allow write: if false;
    }
    match /students/{studentId} {
      allow read: if false;
      allow write: if false;
    }
  }
}
`;

const ruleset = await client.request({
  url: `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
  method: 'POST',
  data: {
    source: {
      files: [{ name: 'firestore.rules', content: rulesSource }],
    },
  },
});

console.log('Created ruleset:', ruleset.data.name);

const release = await client.request({
  url: `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
  method: 'PATCH',
  data: {
    release: {
      name: `projects/${projectId}/releases/cloud.firestore`,
      rulesetName: ruleset.data.name,
    },
  },
});

console.log('Release updated:', JSON.stringify(release.data, null, 2));
