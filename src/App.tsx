import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { useEffect, useState, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

const Login = React.lazy(() => import('./pages/Login'));
const SetupProfile = React.lazy(() => import('./pages/SetupProfile'));
const Browse = React.lazy(() => import('./pages/Browse'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Ratings = React.lazy(() => import('./pages/Ratings'));
const Notifications = React.lazy(() => import('./pages/Notifications'));

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-[100dvh] bg-[#131315] flex items-center justify-center text-[#F0EEE8]">Loading...</div>;
  }

  return (
    <Router>
      <Suspense fallback={<div className="min-h-[100dvh] bg-[#131315] flex items-center justify-center text-[#F0EEE8]">Loading...</div>}>
        <Routes>
          <Route path="/" element={!user ? <Login /> : <Navigate to="/setup" />} />
          <Route path="/setup" element={user ? <SetupProfile /> : <Navigate to="/" />} />
          <Route path="/browse" element={user ? <Browse /> : <Navigate to="/" />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/" />} />
          <Route path="/ratings" element={user ? <Ratings /> : <Navigate to="/" />} />
          <Route path="/notifications" element={user ? <Notifications /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
