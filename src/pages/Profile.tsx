import React, { useState, useEffect } from 'react';
import { LogOut, Star, Lock, Sparkles, Settings, X, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BottomNavBar } from '../components/BottomNavBar';
import { auth, db, storage } from '../firebase';
import { doc, collection, query, where, getDocs, onSnapshot, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { GoogleGenAI } from "@google/genai";
import { uploadPhotoWithPresignedUrl } from '../lib/presignedUpload';
import { uploadFileWithProgress } from '../lib/firebaseUpload';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editPhoto1, setEditPhoto1] = useState('');
  const [editPhoto2, setEditPhoto2] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen to profile changes in real-time
    const unsubscribeProfile = onSnapshot(doc(db, 'publicProfiles', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
    });

    const fetchRatings = async () => {
      try {
        // Fetch ratings received
        const q = query(
          collection(db, 'ratings'), 
          where('targetId', '==', auth.currentUser.uid)
        );
        const ratingsSnap = await getDocs(q);
        const fetchedRatings = ratingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Sort locally by date descending
        fetchedRatings.sort((a: any, b: any) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        
        setRatings(fetchedRatings);
      } catch (error) {
        console.error("Error fetching profile data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchRatings();

    return () => unsubscribeProfile();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const openEditProfile = () => {
    setEditName(profile?.displayName || '');
    setEditLocation(profile?.location || '');
    setEditPhoto1(profile?.photos?.[0] || '');
    setEditPhoto2(profile?.photos?.[1] || '');
    setIsEditingProfile(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, photoNum: 1 | 2) => {
    if (!auth.currentUser) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setUploadProgress(0);
    try {
      const idToken = await auth.currentUser.getIdToken();
      let downloadURL: string;
      try {
        downloadURL = await uploadPhotoWithPresignedUrl(
          {
            file,
            uid: auth.currentUser.uid,
            photoNum,
            idToken,
          },
          setUploadProgress,
        );
      } catch (presignedError) {
        // Fallback for browser-side S3 CORS/network issues.
        const storagePath = `profiles/${auth.currentUser.uid}/photo_${photoNum}_${Date.now()}_${file.name}`;
        downloadURL = await uploadFileWithProgress(storage, storagePath, file, setUploadProgress);
      }
      
      if (photoNum === 1) setEditPhoto1(downloadURL);
      if (photoNum === 2) setEditPhoto2(downloadURL);
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      const code = error?.code ? String(error.code) : 'unknown';
      const message = error?.message ? String(error.message) : 'No error message from upload service.';
      alert(`Failed to upload photo.\n\nCode: ${code}\nMessage: ${message}`);
    } finally {
      setIsUploadingPhoto(false);
      setUploadProgress(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!auth.currentUser) return;
    setIsSavingProfile(true);
    try {
      const photos = [editPhoto1, editPhoto2].filter(p => p.trim() !== '');
      if (photos.length === 0) photos.push('https://picsum.photos/seed/user/400/500');
      
      await updateDoc(doc(db, 'publicProfiles', auth.currentUser.uid), {
        displayName: editName,
        location: editLocation,
        photos
      });
      setIsEditingProfile(false);
    } catch (error) {
      console.error("Error updating profile", error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const generateAiAnalysis = async () => {
    setIsGeneratingAi(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const comments = ratings.filter(r => r.comment).map(r => r.comment);
      if (comments.length === 0) {
        setAiAnalysis("Not enough comments to generate an analysis yet! Get more reviews.");
        setIsGeneratingAi(false);
        return;
      }

      const prompt = `You are an expert dating and social profile consultant. Based on the following anonymous feedback comments a user received, write a fun, encouraging, and constructive 3-sentence summary of their "vibe", what people like about them, and one piece of constructive advice. Keep it lighthearted and use emojis. Comments: ${comments.join(" | ")}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setAiAnalysis(response.text || "Couldn't generate analysis.");
    } catch (error) {
      console.error("Error generating AI analysis", error);
      setAiAnalysis("Oops, couldn't generate the analysis right now.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const totalReviews = ratings.length;
  const ratingsSum = ratings.reduce((sum, current) => sum + (current.score || 0), 0);
  const avgRating = totalReviews > 0 ? ratingsSum / totalReviews : 0;

  if (loading) {
    return <div className="min-h-screen bg-[#131315] flex items-center justify-center text-[#F0EEE8]">Loading profile...</div>;
  }

  const reviewsGiven = profile?.reviewsGivenCount || 0;
  const unlockedReports = Math.floor(reviewsGiven / 5);
  const progress = reviewsGiven % 5;
  const reviewsNeeded = 5 - progress;

  return (
    <main className="pt-16 pb-32 px-5 w-full max-w-[760px] mx-auto min-h-screen relative overflow-hidden bg-[#0F0F11]">
      <div className="blob-bg w-[350px] h-[350px] bg-[#9C3241] top-[-100px] left-[-150px]"></div>
      <div className="blob-bg w-[300px] h-[300px] bg-[#2C416C] top-[30%] right-[-150px]"></div>
      <div className="blob-bg w-[300px] h-[300px] bg-[#612A4A] bottom-[150px] left-[-100px]"></div>

      {/* Top AppBar */}
      <header className="relative z-10 flex justify-between items-center py-2 mb-8">
        <div className="w-8 flex items-center justify-start text-white/70 cursor-pointer hover:text-white" onClick={openEditProfile} title="Edit Profile">
          <Settings size={26} strokeWidth={1.5} />
        </div>
        <h1 className="text-[15px] font-semibold tracking-wide text-white uppercase ml-1">Personal Insights Report</h1>
        <div className="w-9 h-9 rounded-full overflow-hidden border border-white/20 shrink-0 shadow-lg" title="Profile picture">
          <img src={profile?.photos?.[0] || auth.currentUser?.photoURL || "https://picsum.photos/seed/user/100/100"} alt="Avatar" className="w-full h-full object-cover" />
        </div>
      </header>

      <div className="relative z-10">
        {unlockedReports === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center mt-20">
            <div className="w-24 h-24 rounded-full glass-panel flex items-center justify-center mb-6 shadow-2xl">
              <Lock className="text-white/60" size={40} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Report Locked</h2>
            <p className="text-white/60 mb-8 max-w-[250px]">
              You need to rate <strong className="text-white">{reviewsNeeded} more profiles</strong> to unlock your first report.
            </p>
            
            <div className="w-full glass-panel rounded-2xl p-6 mb-8">
              <div className="flex justify-between text-sm mb-3">
                <span className="text-white/60">Progress</span>
                <span className="text-[#FF4D6D] font-bold">{progress} / 5</span>
              </div>
              <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-sunset-gradient rounded-full shadow-[0_0_10px_rgba(255,107,107,0.5)] transition-all duration-500" style={{ width: `${(progress / 5) * 100}%` }}></div>
              </div>
            </div>

            <Link to="/browse" className="w-full h-[58px] rounded-[16px] bg-sunset-gradient shadow-[0_4px_24px_rgba(255,107,107,0.3)] text-white font-bold text-[17px] flex items-center justify-center active:scale-95 transition-transform">
              Go Rate Profiles
            </Link>
          </div>
        ) : (
          <>
            {/* Unlock Banner */}
            <div className="relative w-full h-[150px] rounded-[24px] overflow-hidden mb-6 shadow-2xl border border-white/10 group">
              <div className="absolute inset-0 bg-sunset-gradient opacity-90 mix-blend-screen"></div>
              <div className="absolute inset-0 bg-white/10 backdrop-blur-md"></div>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-yellow-300/30 to-pink-500/30 mix-blend-overlay"></div>
              
              <div className="relative z-10 w-full h-full flex flex-col justify-center items-center">
                <h2 className="text-[28px] font-bold text-white drop-shadow-md tracking-tight mb-1">Report Unlocked!</h2>
                <p className="text-[16px] text-white/90 drop-shadow-sm font-medium w-full max-w-[200px] text-center leading-tight">You've unlocked your premium report!</p>
              </div>
            </div>

            {/* Score Card */}
            <div className="glass-panel h-[130px] rounded-[24px] px-8 flex items-center justify-between mb-6">
              <span className="text-[72px] font-medium leading-none text-white tracking-tighter drop-shadow-sm">{avgRating.toFixed(1)}</span>
              <div className="flex flex-col items-center gap-2 pt-2">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star}
                      className={star <= Math.round(avgRating) ? "text-[#F5C842] drop-shadow-[0_0_12px_rgba(245,200,66,0.6)]" : "text-white/20"}
                      size={26}
                      fill={star <= Math.round(avgRating) ? "currentColor" : "none"}
                    />
                  ))}
                </div>
                <span className="text-[14px] text-white/70 font-medium tracking-wide">AVERAGE RATING</span>
              </div>
            </div>

            {/* AI Analysis Section */}
            <div className="glass-panel rounded-[24px] p-6 mb-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-[#FF4D6D]/5 to-transparent"></div>
               <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="text-white shrink-0 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" size={24} />
                    <h4 className="text-[20px] font-bold text-white tracking-tight">AI Profile Analysis</h4>
                  </div>
                  
                  {!aiAnalysis ? (
                    <div className="mt-6">
                      <button 
                        onClick={generateAiAnalysis}
                        disabled={isGeneratingAi}
                        className="w-full h-[54px] rounded-2xl glass-panel flex items-center justify-center border border-[#FF4D6D]/40 active:scale-[0.98] transition-all bg-white/5 hover:bg-white/10"
                      >
                        <span className="text-white font-semibold text-[16px] drop-shadow-[0_0_8px_rgba(255,77,109,0.8)]">
                          {isGeneratingAi ? "Generating insights..." : "Generate AI Insights"}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 mt-4 border-t border-white/10 pt-4">
                      <p className="text-[15px] text-white/90 leading-relaxed font-medium">
                        {aiAnalysis}
                      </p>
                      <button 
                        onClick={generateAiAnalysis}
                        className="mt-5 text-[13px] text-[#FF4D6D] font-bold tracking-wide uppercase hover:underline"
                      >
                        Regenerate
                      </button>
                    </div>
                  )}
               </div>
            </div>
          </>
        )}

        {/* Logout Button */}
        <button 
          onClick={handleLogout}
          className="w-full mb-8 h-[58px] rounded-[16px] glass-panel border-[#FF4D6D]/40 text-[#FF4D6D] font-bold text-[18px] flex justify-center items-center gap-2 active:scale-95 transition-transform hover:bg-white/5"
        >
          <LogOut size={20} />
          Log Out
        </button>
      </div>

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col justify-end sm:justify-center p-0 sm:p-6 backdrop-blur-sm">
          <div className="bg-[#1C1C1E] w-full sm:max-w-md mx-auto rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-5 border-t border-[#2D2D30] sm:border shadow-2xl relative z-10">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-[#F0EEE8] font-bold text-[22px] tracking-tight">Edit Profile</h3>
              <div onClick={() => setIsEditingProfile(false)} className="cursor-pointer text-[#8A8894] hover:text-white p-2 -mr-2 active:scale-95 transition-transform">
                <X size={24} />
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[13px] text-[#8A8894] font-medium ml-1 mb-1.5 block">Display Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-[#131315] border border-[#2D2D30] rounded-[14px] p-3.5 text-[#F0EEE8] outline-none focus:border-[#FF4D6D] transition-colors"
                />
              </div>

              <div>
                <label className="text-[13px] text-[#8A8894] font-medium ml-1 mb-1.5 block">Location</label>
                <input 
                  type="text" 
                  value={editLocation}
                  onChange={e => setEditLocation(e.target.value)}
                  className="w-full bg-[#131315] border border-[#2D2D30] rounded-[14px] p-3.5 text-[#F0EEE8] outline-none focus:border-[#FF4D6D] transition-colors"
                />
              </div>

              <div>
                <label className="text-[13px] text-[#8A8894] font-medium ml-1 mb-2 block flex justify-between">
                  Profile Photos <span className="text-[#8A8894] font-normal">Required</span>
                </label>
                <div className="flex gap-4">
                  {/* Photo 1 Upload */}
                  <label className="flex-1 aspect-[3/4] relative rounded-2xl overflow-hidden bg-[#131315] border border-[#2D2D30] hover:border-[#FF4D6D] focus-within:border-[#FF4D6D] cursor-pointer flex items-center justify-center transition-colors group">
                    <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, 1)} className="hidden" disabled={isUploadingPhoto} />
                    {editPhoto1 ? (
                      <img src={editPhoto1} alt="Photo 1" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                    ) : (
                      <Plus className="text-[#8A8894]" size={28} />
                    )}
                    {isUploadingPhoto && !editPhoto1 && <span className="absolute text-[#F0EEE8] text-xs">{uploadProgress ?? 0}%</span>}
                  </label>

                  {/* Photo 2 Upload */}
                  <label className="flex-1 aspect-[3/4] relative rounded-2xl overflow-hidden bg-[#131315] border border-[#2D2D30] hover:border-[#FF4D6D] focus-within:border-[#FF4D6D] border-dashed cursor-pointer flex items-center justify-center transition-colors group">
                    <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, 2)} className="hidden" disabled={isUploadingPhoto} />
                    {editPhoto2 ? (
                      <img src={editPhoto2} alt="Photo 2" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                    ) : (
                      <div className="flex flex-col items-center opacity-60 group-hover:opacity-100 transition-opacity">
                        <Plus className="text-[#8A8894] mb-1" size={24} />
                        <span className="text-[#8A8894] text-[11px]">Optional</span>
                      </div>
                    )}
                    {isUploadingPhoto && !editPhoto2 && <span className="absolute text-[#F0EEE8] text-xs">{uploadProgress ?? 0}%</span>}
                  </label>
                </div>
              </div>
            </div>

            <button 
              onClick={handleSaveProfile} 
              disabled={isSavingProfile || isUploadingPhoto}
              className="w-full mt-4 h-[56px] rounded-[16px] bg-coral-gradient text-[#FFFFFF] font-bold shadow-[0_4px_24px_rgba(255,77,109,0.3)] active:scale-95 transition-all text-[16px] disabled:opacity-70 disabled:scale-100"
            >
              {isSavingProfile ? 'Saving...' : isUploadingPhoto ? `Uploading ${uploadProgress ?? 0}%` : 'Save Profile'}
            </button>
            <div className="pb-2 sm:pb-0"></div>
          </div>
        </div>
      )}

      <BottomNavBar />
    </main>
  );
}
