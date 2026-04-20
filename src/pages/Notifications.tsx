import { useState, useEffect } from 'react';
import { BottomNavBar } from '../components/BottomNavBar';
import { Bell, Star } from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, query, where, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { formatTimeAgo, toUnixMs } from '../lib/time';
import type { TimestampLike } from '../lib/types';

interface NotificationData {
  id: string;
  raterId?: string;
  targetId?: string;
  score?: number;
  comment?: string;
  createdAt?: TimestampLike;
  raterProfile?: {
    displayName?: string;
    photos?: string[];
  } | null;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'ratings'),
          where('targetId', '==', auth.currentUser.uid),
          limit(50)
        );
        const snapshot = await getDocs(q);
        
        // Use a local cache to avoid fetching the same raterProfile multiple times
        const profileCache: Record<string, NotificationData['raterProfile']> = {};
        
        // Execute profile fetches concurrently using Promise.all
        const notifData = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let raterProfile = null;
          
          if (data.raterId) {
            if (profileCache[data.raterId]) {
              raterProfile = profileCache[data.raterId];
            } else {
              try {
                const profileSnap = await getDoc(doc(db, 'publicProfiles', data.raterId));
                if (profileSnap.exists()) {
                  raterProfile = profileSnap.data();
                  profileCache[data.raterId] = raterProfile;
                }
              } catch (e) {
                console.error("Error fetching rater profile", e);
              }
            }
          }
          
          return {
            id: docSnap.id,
            ...data,
            raterProfile
          } as NotificationData;
        }));
        
        // Sort by createdAt descending in memory
        notifData.sort((a, b) => {
          const timeA = toUnixMs(a.createdAt);
          const timeB = toUnixMs(b.createdAt);
          return timeB - timeA;
        });

        setNotifications(notifData);
      } catch (error) {
        console.error("Error fetching notifications:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, []);

  return (
    <main className="pt-8 pb-32 px-5 w-full max-w-[760px] mx-auto min-h-screen relative overflow-hidden bg-[#0F0F11]">
      <div className="blob-bg w-[350px] h-[350px] bg-[#16368C] top-[-100px] left-[-150px]"></div>
      <div className="blob-bg w-[300px] h-[300px] bg-[#5C168C] bottom-[150px] right-[-100px]"></div>

      <header className="relative z-10 w-full mb-8">
        <div className="glass-panel w-full rounded-[24px] py-5 flex items-center justify-center">
            <h1 className="text-[26px] font-bold tracking-tight text-white drop-shadow-md">Notifications</h1>
        </div>
      </header>

      <div className="relative z-10">
        <h3 className="text-[20px] font-bold text-white tracking-tight mb-4 ml-1">Recent Activity</h3>
        
        {loading ? (
          <div className="flex items-center justify-center h-40 text-white/50">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[40vh] text-center">
            <div className="w-20 h-20 rounded-full glass-panel flex items-center justify-center mb-6">
              <Bell className="text-white/40" size={36} />
            </div>
            <h2 className="text-[20px] font-bold text-white mb-2 tracking-tight">No notifications</h2>
            <p className="text-[14px] text-white/60">You have no new notifications right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map(notif => (
              (() => {
                const score = notif.score ?? 0;
                return (
              <div key={notif.id} className="glass-panel rounded-[20px] p-4 flex gap-4 items-center">
                <div className="w-[52px] h-[52px] rounded-full overflow-hidden shrink-0 bg-black/20 border border-white/5">
                  <img 
                    src={notif.raterProfile?.photos?.[0] || "https://picsum.photos/seed/user/100/100"} 
                    alt="Rater" 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold text-white text-[15px] leading-tight">
                      {notif.raterProfile?.displayName ? `${notif.raterProfile.displayName} rated your profile` : 'New rating received'}
                    </p>
                    <span className="text-[13px] text-white/50 whitespace-nowrap ml-2">
                      {formatTimeAgo(notif.createdAt)}
                    </span>
                  </div>
                  <div className="flex gap-0.5 mt-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star 
                        key={i}
                        className={i <= score ? "text-[#F5C842]" : "text-white/20"} 
                        size={14} 
                        fill={i <= score ? "currentColor" : "none"} 
                      />
                    ))}
                  </div>
                </div>
              </div>
                );
              })()
            ))}
          </div>
        )}
      </div>
      <BottomNavBar />
    </main>
  );
}
