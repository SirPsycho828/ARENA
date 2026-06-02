import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAyZ5vuLHfRarQOBYUonEKrJRxDpuivpWo',
  authDomain: 'arena-debate.firebaseapp.com',
  projectId: 'arena-debate',
  storageBucket: 'arena-debate.firebasestorage.app',
  messagingSenderId: '1062409479717',
  appId: '1:1062409479717:web:e8800a95e2c6cd49e381cc',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
