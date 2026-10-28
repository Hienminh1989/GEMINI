const fs = require('fs');
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
let env = fs.readFileSync('.env', 'utf8').catch ? '' : '';
try { env = fs.readFileSync('.env', 'utf8'); } catch(e) {}
env += `\nVITE_FIREBASE_API_KEY=${config.apiKey}`;
env += `\nVITE_FIREBASE_AUTH_DOMAIN=${config.authDomain}`;
env += `\nVITE_FIREBASE_PROJECT_ID=${config.projectId}`;
env += `\nVITE_FIREBASE_STORAGE_BUCKET=${config.storageBucket}`;
env += `\nVITE_FIREBASE_MESSAGING_SENDER_ID=${config.messagingSenderId}`;
env += `\nVITE_FIREBASE_APP_ID=${config.appId}`;
env += `\nVITE_FIREBASE_FIRESTORE_DATABASE_ID=${config.firestoreDatabaseId}`;
fs.writeFileSync('.env', env);
