/**
 * seed-profiles.ts
 * Creates fake test user accounts in Firebase Auth + Firestore.
 * Run with: npx tsx scripts/seed-profiles.ts
 */
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'firebase-applet-config.json'), 'utf8')
);

const TEST_PROFILES = [
  {
    email: 'nb.sophia.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Sophia Chen, 23',
    location: 'San Francisco, US',
    photos: [
      'https://randomuser.me/api/portraits/women/44.jpg',
      'https://randomuser.me/api/portraits/women/68.jpg',
    ],
  },
  {
    email: 'nb.marcus.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Marcus Rivera, 26',
    location: 'Miami, US',
    photos: [
      'https://randomuser.me/api/portraits/men/32.jpg',
      'https://randomuser.me/api/portraits/men/45.jpg',
    ],
  },
  {
    email: 'nb.priya.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Priya Sharma, 22',
    location: 'Mumbai, IN',
    photos: [
      'https://randomuser.me/api/portraits/women/25.jpg',
      'https://randomuser.me/api/portraits/women/90.jpg',
    ],
  },
  {
    email: 'nb.ethan.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Ethan Brooks, 27',
    location: 'London, UK',
    photos: [
      'https://randomuser.me/api/portraits/men/75.jpg',
      'https://randomuser.me/api/portraits/men/36.jpg',
    ],
  },
  {
    email: 'nb.luna.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Luna Martinez, 24',
    location: 'Barcelona, ES',
    photos: [
      'https://randomuser.me/api/portraits/women/33.jpg',
      'https://randomuser.me/api/portraits/women/57.jpg',
    ],
  },
  {
    email: 'nb.kai.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Kai Tanaka, 25',
    location: 'Tokyo, JP',
    photos: [
      'https://randomuser.me/api/portraits/men/12.jpg',
      'https://randomuser.me/api/portraits/men/22.jpg',
    ],
  },
  {
    email: 'nb.ava.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Ava Johansson, 21',
    location: 'Stockholm, SE',
    photos: [
      'https://randomuser.me/api/portraits/women/17.jpg',
      'https://randomuser.me/api/portraits/women/79.jpg',
    ],
  },
  {
    email: 'nb.rafael.test@gmail.com',
    password: 'DrateTesting2026!',
    name: 'Rafael Costa, 28',
    location: 'São Paulo, BR',
    photos: [
      'https://randomuser.me/api/portraits/men/54.jpg',
      'https://randomuser.me/api/portraits/men/67.jpg',
    ],
  },
];

async function seedProfiles() {
  console.log('🌱 Starting DRATE profile seeding...\n');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  let created = 0;
  let skipped = 0;

  for (const profile of TEST_PROFILES) {
    try {
      // 1. Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        profile.email,
        profile.password
      );
      const uid = userCredential.user.uid;

      // 2. Write private user doc
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: profile.email,
        role: 'user',
        createdAt: serverTimestamp(),
      });

      // 3. Write public profile doc
      await setDoc(doc(db, 'publicProfiles', uid), {
        uid,
        displayName: profile.name,
        location: profile.location,
        photos: profile.photos,
        reviewsGivenCount: 0,
        averageRating: 0,
        totalRatings: 0,
        ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        createdAt: serverTimestamp(),
      });

      // 4. Sign out so the next iteration can create a new user
      await signOut(auth);

      created++;
      console.log(`  ✅ ${profile.name}  |  ${profile.email}  |  ${profile.location}`);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        skipped++;
        console.log(`  ⏭️  ${profile.name} — already exists, skipping`);
      } else {
        console.error(`  ❌ ${profile.name} — ${error.code || error.message}`);
      }
    }
  }

  console.log(`\n🎉 Seeding complete!  Created: ${created}  |  Skipped: ${skipped}`);
  console.log('\n📋 All test accounts use password: DrateTesting2026!\n');
  process.exit(0);
}

seedProfiles().catch((err) => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
