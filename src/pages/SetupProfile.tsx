import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Plus, Verified, Clock, Wand2 } from 'lucide-react';
import { auth, db, storage } from '../firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { uploadPhotoWithPresignedUrl } from '../lib/presignedUpload';
import { uploadFileWithProgress } from '../lib/firebaseUpload';

export default function SetupProfile() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [photo1, setPhoto1] = useState(auth.currentUser?.photoURL || '');
  const [photo2, setPhoto2] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState(auth.currentUser?.displayName || '');
  const [checking, setChecking] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  useEffect(() => {
    const checkExisting = async () => {
      if (auth.currentUser) {
        try {
          const snap = await getDoc(doc(db, 'publicProfiles', auth.currentUser.uid));
          if (snap.exists()) {
            navigate('/browse');
          } else {
            setChecking(false);
          }
        } catch (e) {
          setChecking(false);
        }
      }
    };
    checkExisting();
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen bg-[#131315] flex items-center justify-center text-[#F0EEE8]">Loading...</div>;
  }

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setIsSaving(true);
    
    try {
      const uid = auth.currentUser.uid;
      const email = auth.currentUser.email || '';
      const displayName = displayNameInput.trim() || 'Anonymous';
      
      const finalPhotos = [photo1, photo2].filter(p => p.trim() !== '');
      if (finalPhotos.length < 2) {
        alert('You must upload exactly 2 images to continue.');
        setIsSaving(false);
        return;
      }

      // Save Private Profile
      await setDoc(doc(db, 'users', uid), {
        uid,
        email,
        role: 'user',
        createdAt: serverTimestamp()
      });

      // Save Public Profile
      await setDoc(doc(db, 'publicProfiles', uid), {
        uid,
        displayName,
        location: 'Global',
        photos: finalPhotos,
        reviewsGivenCount: 0,
        averageRating: 0,
        totalRatings: 0,
        ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        createdAt: serverTimestamp()
      });

      navigate('/browse');
    } catch (error) {
      console.error('Error saving profile', error);
      alert('Failed to save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, photoNum: 1 | 2) => {
    if (!auth.currentUser) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const idToken = await auth.currentUser.getIdToken();
      let downloadURL: string;
      
      try {
        setUploadProgress(5);
        downloadURL = await uploadPhotoWithPresignedUrl(
          {
            file,
            uid: auth.currentUser.uid,
            photoNum,
            idToken,
          },
          (p) => setUploadProgress(5 + (p * 0.95))
        );
      } catch (presignedError: any) {
        console.warn('S3 upload failed, attempt fallback to Firebase:', presignedError);
        // If it's a server config error, don't just silently fallback if we want to debug S3
        if (presignedError.message?.includes('Server misconfigured')) {
          throw presignedError; 
        }
        
        const storagePath = `profiles/${auth.currentUser.uid}/photo_${photoNum}_${Date.now()}_${file.name}`;
        downloadURL = await uploadFileWithProgress(storage, storagePath, file, (p) => setUploadProgress(p));
      }
      
      if (photoNum === 1) setPhoto1(downloadURL);
      if (photoNum === 2) setPhoto2(downloadURL);
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      const message = error?.message ? String(error.message) : 'Unknown upload error.';
      
      let userFriendlyMessage = message;
      if (message.includes('Missing AWS credentials')) {
        userFriendlyMessage = "AWS S3 keys are not set in the AI Studio menu. Please add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and AWS_S3_BUCKET to your Secrets.";
      } else if (message.includes('CORS')) {
        userFriendlyMessage = "Upload blocked by S3 CORS policy. Please enable CORS in your AWS S3 bucket settings.";
      }
      
      alert(`Upload Error:\n\n${userFriendlyMessage}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <main className="w-full min-h-[100dvh] bg-[#0F0F11] flex flex-col relative overflow-hidden pb-32 max-w-[760px] mx-auto pt-[env(safe-area-inset-top)]">
      <div className="blob-bg w-[400px] h-[400px] bg-[#9C3241] top-[-150px] right-[-150px]"></div>
      <div className="blob-bg w-[300px] h-[300px] bg-[#5C168C] bottom-[10%] left-[-150px]"></div>

      {/* TopAppBar */}
      <nav className="w-full top-0 sticky flex justify-between items-center px-6 py-4 z-10">
        <div onClick={() => signOut(auth)} className="flex items-center gap-2 active:scale-95 duration-200 cursor-pointer">
          <ArrowLeft className="text-white/70" size={20} />
          <span className="text-white/70 font-medium text-sm">Log out</span>
        </div>
        <div className="font-bold tracking-tight text-white uppercase text-xs drop-shadow-md">COMPLETE PROFILE</div>
        <div className="w-10"></div>
      </nav>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-white/5 flex relative z-10">
        <div className="w-1/2 h-full bg-sunset-gradient shadow-[0_0_8px_rgba(255,107,107,0.5)]"></div>
      </div>

      {/* Header Section */}
      <header className="px-6 pt-8 pb-6 relative z-10">
        <h1 className="text-[28px] font-bold text-white tracking-tight drop-shadow-sm leading-tight">Set up your profile</h1>
        <p className="text-[15px] text-white/70 mt-1 font-medium">Add your details to continue</p>
      </header>

      {/* Inputs Details */}
      <section className="px-6 mb-6 relative z-10">
        <label className="text-[14px] text-white/70 font-medium ml-1 mb-2 block">Display Name</label>
        <input 
          type="text" 
          value={displayNameInput}
          onChange={e => setDisplayNameInput(e.target.value)}
          placeholder="What should we call you?"
          className="w-full h-[58px] glass-panel rounded-[16px] px-5 text-white outline-none focus:border-[#FF4D6D] focus:bg-white/10 transition-colors placeholder:text-white/30"
        />
      </section>

      {/* Photo Selection Grid */}
      <section className="px-6 flex gap-4 relative z-10">
        {/* Photo 1 */}
        <div className="flex-1 flex flex-col gap-3">
          <label 
            className="aspect-[159/200] relative w-full rounded-2xl overflow-hidden glass-panel flex items-center justify-center focus-within:border-[#FF4D6D] transition-all cursor-pointer shadow-lg"
          >
            <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, 1)} className="hidden" disabled={isUploading} />
            {photo1 ? (
              <>
                <img src={photo1} alt="Photo 1" className="w-full h-full object-cover opacity-90" />
                <div className="absolute bottom-3 right-3 w-6 h-6 bg-sunset-gradient rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(255,107,107,0.5)]">
                  <Check className="text-white" size={16} strokeWidth={3} />
                </div>
              </>
            ) : (
              <Plus className="text-white/50" size={36} />
            )}
          </label>
          <span className="text-[13px] font-medium text-white/80 text-center">{isUploading ? `${uploadProgress ?? 0}%` : 'Photo 1'}</span>
        </div>

        {/* Photo 2 */}
        <div className="flex-1 flex flex-col gap-3">
          <label 
            className="aspect-[159/200] relative w-full rounded-2xl glass-panel border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:border-[#FF4D6D] focus-within:border-[#FF4D6D] transition-all overflow-hidden cursor-pointer"
          >
            <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, 2)} className="hidden" disabled={isUploading} />
            {photo2 ? (
              <>
                <img src={photo2} alt="Photo 2" className="w-full h-full object-cover opacity-90" />
                <div className="absolute bottom-3 right-3 w-6 h-6 bg-sunset-gradient rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(255,107,107,0.5)]">
                  <Check className="text-white" size={16} strokeWidth={3} />
                </div>
              </>
            ) : (
              <>
                <Plus className="text-white/40 mb-1" size={32} />
                <span className="text-[13px] font-medium text-white/50">Add photo</span>
              </>
            )}
          </label>
          <span className="text-[13px] font-medium text-white/80 text-center">{isUploading ? `${uploadProgress ?? 0}%` : 'Photo 2'}</span>
        </div>
      </section>

      {/* Tips Card */}
      <section className="px-6 mt-10 relative z-10">
        <div className="glass-panel rounded-[24px] p-6">
          <h3 className="text-[17px] font-bold text-white mb-5 tracking-tight drop-shadow-sm">Tips for better ratings</h3>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <Verified className="text-[#F5C842] mt-0.5" size={18} />
              <span className="text-[14px] text-white/80 font-medium leading-relaxed">Clear face, natural lighting</span>
            </li>
            <li className="flex items-start gap-3">
              <Clock className="text-[#FF4D6D] mt-0.5" size={18} />
              <span className="text-[14px] text-white/80 font-medium leading-relaxed">Recent and authentic photo</span>
            </li>
            <li className="flex items-start gap-3">
              <Wand2 className="text-[#4D9EFF] mt-0.5" size={18} />
              <span className="text-[14px] text-white/80 font-medium leading-relaxed">No heavy filters or edits</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Bottom Action */}
      <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[760px] px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-8 bg-gradient-to-t from-[#0F0F11] via-[#0F0F11]/80 to-transparent z-20">
        <button 
          onClick={handleSave}
          disabled={isSaving || isUploading}
          className="w-full h-[58px] bg-coral-gradient rounded-[16px] text-white font-bold text-[17px] shadow-[0_4px_24px_rgba(255,77,109,0.3)] flex items-center justify-center active:scale-[0.98] transition-all disabled:opacity-70 disabled:scale-100"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </button>
      </footer>
    </main>
  );
}
