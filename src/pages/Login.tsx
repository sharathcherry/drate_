import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

function authErrorMessage(error: any) {
  const code = String(error?.code || 'unknown');
  const rawMessage = String(error?.message || 'Authentication failed');

  const hints: Record<string, string> = {
    'auth/unauthorized-domain':
      'This site domain is not authorized in Firebase Auth. Add your Vercel domain in Firebase Console > Authentication > Settings > Authorized domains.',
    'auth/operation-not-allowed':
      'This sign-in method is disabled in Firebase Auth. Enable the provider in Firebase Console > Authentication > Sign-in method.',
    'auth/popup-blocked':
      'Popup was blocked by the browser. Allow popups for this site and try again.',
    'auth/popup-closed-by-user':
      'The sign-in popup was closed before completing login.',
    'auth/network-request-failed':
      'Network request failed. Check internet connection and try again.',
  };

  const hint = hints[code];
  return `Code: ${code}\nMessage: ${rawMessage}${hint ? `\n\nFix: ${hint}` : ''}`;
}

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return alert('Please enter both email and password.');
    setIsLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/setup');
    } catch (error: any) {
      console.error('Auth failed', error);
      alert(error.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Run Native Google Auth bottom-sheet flow
        const result = await FirebaseAuthentication.signInWithGoogle();
        
        // Pass the native Google token to Firebase Web Auth to sync session
        if (result.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          await signInWithCredential(auth, credential);
          navigate('/setup');
        } else {
          throw new Error('No valid token returned from native Google Auth');
        }
      } else {
        // Run Web Popup flow
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        navigate('/setup');
      }
    } catch (error: any) {
      console.error('Login failed', error);
      alert(`Login failed.\n\n${authErrorMessage(error)}`);
      setIsLoading(false);
    } 
  };

  return (
    <main className="flex-grow flex flex-col min-h-[100dvh] bg-[#0F0F11] relative overflow-hidden pt-[env(safe-area-inset-top)]">
      <div className="blob-bg w-[400px] h-[400px] bg-[#9C3241] top-[-100px] left-[-150px]"></div>
      <div className="blob-bg w-[300px] h-[300px] bg-[#5C168C] bottom-[150px] right-[-100px]"></div>

      <div className="w-full max-w-[760px] mx-auto flex flex-col flex-1 h-full z-10 relative">
        {/* Top Section: Logo Area */}
        <section className="flex-1 flex flex-col items-center justify-center space-y-6 px-6 relative py-8">
        
        {/* Logo App Icon */}
        <div className="w-[84px] h-[84px] rounded-[22px] bg-gradient-to-b from-[#353538] to-[#1C1C1E] flex items-center justify-center shadow-2xl relative z-10 border border-white/5">
          <Star className="text-[#FF8BA0]" size={42} fill="url(#star-gradient)" strokeWidth={0} />
          <svg width="0" height="0">
            <linearGradient id="star-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop stopColor="#FF8BA0" offset="0%" />
              <stop stopColor="#FF4D6D" offset="100%" />
            </linearGradient>
          </svg>
        </div>
        
        {/* Branding */}
        <div className="text-center relative z-10">
          <h1 className="text-[44px] font-black text-white tracking-tight leading-tight drop-shadow-md">Drate</h1>
          <p className="text-[15px] text-white/70 mt-2 font-medium">Honest impressions, earned insights.</p>
        </div>
        </section>

        {/* Bottom Auth Card */}
        <section className="w-full">
          <div className="glass-panel w-full rounded-t-[32px] px-8 pt-10 pb-[calc(20px+env(safe-area-inset-bottom))] flex flex-col relative overflow-hidden border-b-0 border-x-0 border-t border-white/20">
          {/* Inner ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
          
          <div className="mb-6 pl-1">
            <h2 className="text-[26px] font-bold text-white tracking-tight drop-shadow-sm">
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </h2>
            <p className="text-[15px] text-white/70 mt-1.5">
              {isSignUp ? 'Sign up to get started' : 'Sign in to your account'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full h-[58px] bg-[#131315] border border-[#2D2D30] rounded-[16px] px-5 text-[#F0EEE8] outline-none focus:border-[#FF4D6D] transition-colors"
                required
              />
            </div>
            <div>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full h-[58px] bg-[#131315] border border-[#2D2D30] rounded-[16px] px-5 text-[#F0EEE8] outline-none focus:border-[#FF4D6D] transition-colors"
                required
              />
            </div>
            <button 
              type="submit"
              disabled={isLoading}
              className="group relative w-full h-[58px] rounded-[16px] bg-coral-gradient shadow-[0_4px_24px_rgba(255,77,109,0.3)] active:scale-[0.98] transition-all flex items-center justify-center overflow-hidden mt-2 disabled:opacity-70 disabled:scale-100"
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-[#FFFFFF] font-bold text-[17px] drop-shadow-sm flex items-center gap-3">
                {isLoading ? (isSignUp ? 'Creating...' : 'Signing In...') : (isSignUp ? 'Sign Up' : 'Sign In')}
              </span>
            </button>
          </form>

          <div className="mt-6 flex items-center gap-4 before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10">
            <span className="text-xs text-[#8A8894] uppercase tracking-wider font-medium">Or continue with</span>
          </div>

          <button 
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-[58px] mt-6 rounded-[16px] bg-[#131315] border border-[#2D2D30] flex items-center justify-center gap-3 active:scale-[0.98] transition-all hover:bg-[#1C1C1E] disabled:opacity-70 disabled:scale-100"
          >
            <svg className="w-[20px] h-[20px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#FFF"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#FFF"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FFF"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#FFF"/>
            </svg>
            <span className="text-[#F0EEE8] font-bold text-[15px]">Google</span>
          </button>

          <div className="mt-8 text-center">
            <p className="text-[#8A8894] text-[14px]">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              <button 
                onClick={() => setIsSignUp(!isSignUp)} 
                type="button"
                className="text-[#FF8BA0] font-bold ml-1.5 hover:text-[#FF4D6D] transition-colors tracking-wide"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
          </div>
        </section>
      </div>
    </main>
  );
}
