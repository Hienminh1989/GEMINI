import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAD4sjzNGF9aB2BWYlkUeOouZmD3KRIUkQ",
  authDomain: "cham-cong-app-d1fa2.firebaseapp.com",
  projectId: "cham-cong-app-d1fa2",
  storageBucket: "cham-cong-app-d1fa2.firebasestorage.app",
  messagingSenderId: "459101573703",
  appId: "1:459101573703:web:8b94f510c474866b679762",
  measurementId: "G-VGXEGQHLZR"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);


