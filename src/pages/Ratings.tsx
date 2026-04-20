import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BottomNavBar } from '../components/BottomNavBar';
import { Star } from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { getDummyProfile } from '../lib/dummyData';
import { formatTimeAgo, toUnixMs } from '../lib/time';
import type { TimestampLike } from '../lib/types';

interface RatingData {
  id: string;
  raterId?: string;
  targetId?: string;
  score?: number;
  comment?: string;
  createdAt?: TimestampLike;
  targetProfile?: {
    displayName?: string;
    photos?: string[];
  } | null;
}

export default function Ratings() {
  const [ratings, setRatings] = useState<RatingData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyRatings = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'ratings'),
          where('raterId', '==', auth.currentUser.uid),
          limit(50)
        );
        const snapshot = await getDocs(q);
        
        // Use a local cache to avoid fetching the same targetProfile multiple times
        const profileCache: Record<string, RatingData['targetProfile']> = {};
        
        // Execute profile fetches concurrently using Promise.all
        const ratingsData = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let targetProfile = null;
          
          if (data.targetId) {
            if (data.targetId.startsWith('dummy_')) {
              targetProfile = getDummyProfile(data.targetId);
            } else if (profileCache[data.targetId]) {
              targetProfile = profileCache[data.targetId];
            } else {
              try {
                const profileSnap = await getDoc(doc(db, 'publicProfiles', data.targetId));
                if (profileSnap.exists()) {
                  targetProfile = profileSnap.data();
                  profileCache[data.targetId] = targetProfile;
                }
              } catch (e) {
                console.error("Error fetching target profile", e);
              }
            }
          }
          
          return {
            id: docSnap.id,
            ...data,
            targetProfile
          } as RatingData;
        }));
        
        // Sort by createdAt descending in memory
        ratingsData.sort((a, b) => {
          const timeA = toUnixMs(a.createdAt);
          const timeB = toUnixMs(b.createdAt);
          return timeB - timeA;
        });

        setRatings(ratingsData);
      } catch (error) {
        console.error("Error fetching ratings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMyRatings();
  }, []);

  return (
    <main className="pt-20 pb-32 px-5 w-full max-w-[760px] mx-auto min-h-screen relative overflow-hidden bg-[#0F0F11]">
      <div className="blob-bg w-[300px] h-[300px] bg-[#16368C] top-[-100px] right-[-100px]"></div>
      <div className="blob-bg w-[300px] h-[300px] bg-[#5C168C] bottom-[100px] left-[-150px]"></div>
      <div className="blob-bg w-[250px] h-[250px] bg-[#D48C20] top-[30%] right-[-50px]"></div>

      <header className="relative z-10 mb-8 mt-2">
        <h1 className="text-[38px] font-bold tracking-tight text-white drop-shadow-md">My Ratings</h1>
      </header>

      <div className="relative z-10">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-[#8A8894]">Loading your ratings...</div>
        ) : ratings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center">
            <div className="w-20 h-20 rounded-full glass-panel flex items-center justify-center mb-6">
              <Star className="text-white/40" size={36} />
            </div>
            <h2 className="text-[22px] font-bold text-white mb-3 tracking-tight">No ratings yet</h2>
            <p className="text-[15px] text-white/60 max-w-[250px] leading-relaxed mb-8">You haven't rated anyone yet. Go to the explore feed to start rating profiles!</p>
            <Link to="/browse" className="h-[52px] px-8 rounded-full glass-panel text-white font-bold text-[16px] flex items-center justify-center active:scale-95 transition-transform border-white/20">
              Go Explore
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {ratings.map(rating => (
              <div key={rating.id} className="glass-panel rounded-[24px] p-5 flex items-center gap-5">
                <div className="w-[60px] h-[60px] rounded-full overflow-hidden shrink-0 border border-white/10 bg-black/20">
                  <img 
                    src={rating.targetProfile?.photos?.[0] || "https://picsum.photos/seed/user/100/100"} 
                    alt="Target" 
                    className="w-full h-full object-cover" 
                  />
                </div>
                
                <div className="flex-1 flex flex-col justify-center gap-1">
                  <span className="font-semibold text-white text-[19px] tracking-tight leading-none drop-shadow-sm">
                    {rating.targetProfile?.displayName || 'Unknown User'}
                  </span>
                  
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex gap-0.5 mt-0.5">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Star 
                          key={i} 
                          className={i <= (rating.score ?? 0) ? "text-[#F5C842]" : "text-white/20"} 
                          size={15} 
                          fill={i <= (rating.score ?? 0) ? "currentColor" : "none"} 
                        />
                      ))}
                    </div>
                  </div>
                  
                  <span className="text-[14px] text-white/70 mt-1">{formatTimeAgo(rating.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNavBar />
    </main>
  );
}
