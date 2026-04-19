import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { DUMMY_PROFILES } from '../lib/dummyData';
import { BottomNavBar } from '../components/BottomNavBar';
import { db, auth } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, where, limit, doc, updateDoc, increment, onSnapshot, setDoc } from 'firebase/firestore';

export default function Browse() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isRatingMode, setIsRatingMode] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'publicProfiles', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentUserProfile(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!auth.currentUser) return;
      try {
        // Run completely independent queries in parallel to drastically improve network performance
        const [profilesSnap, ratingsSnap, blocksSnap] = await Promise.all([
          getDocs(query(collection(db, 'publicProfiles'), limit(150))),
          getDocs(query(collection(db, 'ratings'), where('raterId', '==', auth.currentUser.uid), limit(500))),
          getDocs(query(collection(db, 'blocks'), where('blockerId', '==', auth.currentUser.uid), limit(500)))
        ]);

        const allProfiles = profilesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const ratedIds = new Set(ratingsSnap.docs.map(doc => doc.data().targetId));
        const blockedIds = new Set(blocksSnap.docs.map(doc => doc.data().blockedId));

        // 3. Filter out self, rated profiles, and blocked profiles
        let unratedProfiles = allProfiles.filter(p => 
          p.id !== auth.currentUser?.uid && 
          !ratedIds.has(p.id) && 
          !blockedIds.has(p.id)
        );
        
        // 4. If no real profiles are available to rate, provide dummy profiles for demonstration
        if (unratedProfiles.length === 0) {
           // Only show dummies that haven't been rated or blocked yet
           unratedProfiles = DUMMY_PROFILES.filter(d => !ratedIds.has(d.id) && !blockedIds.has(d.id));

           // If they have somehow rated absolutely every single dummy profile, 
           // loop them back in for demonstration purposes so the app never empties out.
           if (unratedProfiles.length === 0) {
             unratedProfiles = DUMMY_PROFILES;
           }
        }
        
        setProfiles(unratedProfiles);
      } catch (error) {
        console.error("Error fetching profiles", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  const currentProfile = profiles[currentIndex];

  const handleSubmitRating = async () => {
    if (rating === 0 || !currentProfile || !auth.currentUser) return;
    setIsSubmitting(true);
    
    try {
      const uid = auth.currentUser.uid;

      // Save the rating to Firestore
      const ratingData: any = {
        raterId: uid,
        targetId: currentProfile.id,
        score: rating,
        createdAt: serverTimestamp()
      };
      if (comment.trim()) {
        ratingData.comment = comment.trim();
      }

      await addDoc(collection(db, 'ratings'), ratingData);

      // Increment user's reviews given count safely
      const userProfileRef = doc(db, 'publicProfiles', uid);
      try {
        await updateDoc(userProfileRef, {
          reviewsGivenCount: increment(1)
        });
      } catch (updateError: any) {
        // Fallback: If the user bypassed the setup screen and has no profile, create it now
        if (updateError.code === 'not-found') {
          await setDoc(userProfileRef, {
            uid,
            displayName: auth.currentUser.displayName || 'Anonymous',
            location: 'Global',
            photos: [auth.currentUser.photoURL || 'https://picsum.photos/seed/user/400/500'],
            reviewsGivenCount: 1,
            averageRating: 0,
            totalRatings: 0,
            ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
            createdAt: serverTimestamp()
          });
          await setDoc(doc(db, 'users', uid), {
            uid,
            email: auth.currentUser.email || '',
            role: 'user',
            createdAt: serverTimestamp()
          });
        } else {
          throw updateError;
        }
      }
      
      // Move to next profile
      setRating(0);
      setComment('');
      setIsRatingMode(false);
      setCurrentImageIndex(0);
      setCurrentIndex(prev => prev + 1);
    } catch (error: any) {
      console.error("Error submitting rating", error);
      alert(`Failed to submit rating: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    setRating(0);
    setComment('');
    setIsRatingMode(false);
    setCurrentImageIndex(0);
    setCurrentIndex(prev => prev + 1);
  };

  if (loading) {
    return (
      <main className="min-h-screen w-full max-w-[760px] mx-auto px-6 flex flex-col items-center justify-center pb-24 bg-[#0F0F11]">
        <p className="text-[#8A8894]">Finding profiles...</p>
        <BottomNavBar />
      </main>
    );
  }

  if (!currentProfile) {
    return (
      <main className="min-h-screen w-full max-w-[760px] mx-auto px-6 flex flex-col items-center justify-center pb-24 bg-[#0F0F11]">
        <h2 className="text-xl font-bold text-[#F0EEE8]">You're all caught up!</h2>
        <p className="text-[#8A8894] mt-2 mb-6">No more profiles to rate right now.</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-6 py-3 rounded-full bg-[#1C1C1E] border border-white/10 text-white font-medium hover:border-[#FF4D6D] transition-colors"
        >
          Refresh Feed
        </button>
        <BottomNavBar />
      </main>
    );
  }

  return (
    <main className="w-full h-[100dvh] relative overflow-hidden bg-[#0F0F11]">
      {/* TopAppBar */}
      <nav className={`fixed top-[max(1.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 w-[90%] max-w-[760px] z-50 transition-all duration-300 ${isUiVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8 pointer-events-none'}`}>
        <div className="glass-panel rounded-2xl flex justify-between items-center px-5 h-16 w-full">
          <span className="text-[26px] font-bold text-[#FF4D6D] tracking-tight">Drate</span>
          <div className="bg-white/10 border border-white/10 px-4 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-md">
            <span className="text-[13px] font-medium text-white shadow-sm">
              {((currentUserProfile?.reviewsGivenCount || 0) % 5)}/5 reviews
            </span>
            <Star size={12} fill="white" className="text-white" />
          </div>
        </div>
      </nav>

      {/* Profile Display Area with CSS Snap Carousel */}
      <div 
        className="absolute inset-0 bg-[#0F0F11]"
        onClick={() => !isRatingMode && setIsUiVisible(!isUiVisible)}
      >
        <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
             onScroll={(e) => {
               const target = e.target as HTMLDivElement;
               const index = Math.round(target.scrollLeft / target.clientWidth);
               if (index !== currentImageIndex) setCurrentImageIndex(index);
             }}>
          {currentProfile.photos?.map((photoUrl: string, idx: number) => (
            <img key={idx} src={photoUrl} alt={`Profile photo ${idx + 1}`} className="w-full h-[100dvh] object-cover snap-center flex-shrink-0" />
          )) || <img src="" alt="Profile" className="w-full h-full object-cover snap-center" />}
        </div>
        <div className={`absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 pointer-events-none transition-opacity duration-300 ${isUiVisible ? 'opacity-100' : 'opacity-0'}`}></div>

        {/* Carousel Indicators */}
        {currentProfile.photos?.length > 1 && (
          <div className={`absolute top-[100px] left-1/2 -translate-x-1/2 flex gap-2 z-40 transition-opacity duration-300 ${isUiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {currentProfile.photos.map((_: any, idx: number) => (
              <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'w-6 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'w-2.5 bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>

      {/* Profile details overlay - Positioned at bottom initially, centers when rating */}
      <section className={`absolute left-1/2 -translate-x-1/2 w-[90%] max-w-[760px] z-40 transition-all duration-[500ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isRatingMode ? 'top-1/2 -translate-y-1/2' : isUiVisible ? 'bottom-[calc(env(safe-area-inset-bottom)+100px)]' : '-bottom-[100%] opacity-0 pointer-events-none'}`}>
        <div className={`glass-panel w-full rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all duration-[500ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isRatingMode ? 'pb-8 bg-[#0F0F11] border border-white/20' : 'pb-6 pt-5 bg-black/40 border border-white/10'}`}>
           <div className={`relative z-10 flex w-full justify-between items-center gap-4 transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isRatingMode ? 'scale-90 origin-top-left opacity-80' : 'scale-100'}`}>
              <h2 className="text-[36px] font-bold text-white tracking-tight leading-none drop-shadow-md truncate">{currentProfile.displayName}</h2>
              <span className="px-3 py-1.5 rounded-full glass-panel text-white/90 text-[13px] font-medium flex items-center shrink-0 gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"></path></svg>
                {currentProfile.location}
              </span>
           </div>

           {!isRatingMode ? (
              <div className="mt-6 relative z-10 w-full animate-in fade-in duration-500">
                <div className="flex gap-3">
                    <button 
                      onClick={handleSkip} 
                      className="h-[54px] px-6 rounded-2xl glass-panel text-white/80 font-bold active:scale-95 transition-all text-[15px]"
                    >
                      Skip
                    </button>
                    <button 
                      onClick={() => setIsRatingMode(true)}
                      className="flex-1 h-[54px] rounded-2xl font-bold text-[16px] active:scale-[0.98] transition-all bg-coral-gradient text-white shadow-[0_4px_24px_rgba(255,77,109,0.4)]"
                    >
                      Enter for Rating
                    </button>
                </div>
              </div>
           ) : (
             <div className="mt-8 relative z-10 w-full animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[17px] font-bold text-white mb-0 ml-1 text-shadow tracking-tight">Rate this profile</h3>
                    <button onClick={() => setIsRatingMode(false)} className="px-3 py-1.5 rounded-full border border-white/20 text-white/70 text-[13px] font-medium hover:bg-white/10 transition-colors">Cancel</button>
                </div>
                
                <div className="flex justify-between items-center bg-black/40 p-3 rounded-2xl backdrop-blur-md border border-white/5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setRating(star)} className="p-2 transition-transform active:scale-90">
                      <Star 
                        className={`transition-all ${rating >= star ? 'text-[#FF4D6D] drop-shadow-[0_0_12px_rgba(255,77,109,0.8)] scale-[1.15]' : 'text-white/30 hover:text-white/60'}`}
                        size={36}
                        fill={rating >= star ? 'currentColor' : 'none'}
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>

                 {rating > 0 && (
                  <div className="mt-6 animate-in slide-in-from-top-4 fade-in duration-300">
                    <h4 className="text-[14px] font-medium text-white/80 mb-2 ml-1">What stood out?</h4>
                    <div className="flex flex-wrap gap-2">
                      {["Style", "Photography", "Vibe", "Details", "Lighting"].map(suggestion => {
                         const isSelected = comment.includes(suggestion);
                         return (
                          <button
                            key={suggestion}
                            onClick={() => setComment(prev => isSelected ? prev.replace(new RegExp(`(?:, )?${suggestion}`), '').trim().replace(/^,/, '') : (prev ? `${prev}, ${suggestion}` : suggestion))}
                            className={`px-3 py-1.5 rounded-full text-[13px] font-bold transition-all ${isSelected ? 'bg-[#FF4D6D] text-white border-[#FF4D6D]' : 'bg-black/30 border border-white/10 text-white/60 hover:text-white/90 font-medium'}`}
                          >
                            {suggestion}
                          </button>
                         );
                      })}
                    </div>
                    
                    <div className="flex mt-6">
                      <button 
                        onClick={handleSubmitRating}
                        disabled={isSubmitting}
                        className="w-full h-[58px] rounded-[16px] font-bold text-[17px] active:scale-[0.98] transition-all bg-coral-gradient text-white shadow-[0_4px_24px_rgba(255,77,109,0.4)] disabled:opacity-70 disabled:scale-100"
                      >
                        {isSubmitting ? 'Submitting...' : 'Submit Rating'}
                      </button>
                    </div>
                  </div>
                 )}
             </div>
           )}
        </div>
      </section>

      <BottomNavBar hidden={!isUiVisible} />
    </main>
  );
}
