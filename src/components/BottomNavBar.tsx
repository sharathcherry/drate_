import { Link, useLocation } from 'react-router-dom';
import { Compass, Star, Bell, User } from 'lucide-react';
import { cn } from '../lib/utils';

export function BottomNavBar({ hidden = false }: { hidden?: boolean }) {
  const location = useLocation();
  
  const navItems = [
    { icon: Compass, label: 'Explore', path: '/browse' },
    { icon: Star, label: 'Ratings', path: '/ratings' },
    { icon: Bell, label: 'Notifications', path: '/notifications' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  return (
    <nav className={cn(
      "fixed left-1/2 -translate-x-1/2 w-[90%] max-w-sm flex justify-around items-center px-4 py-3 glass-nav rounded-full z-50 transition-all duration-300",
      hidden ? "bottom-[-100px] opacity-0 pointer-events-none" : "bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] opacity-100"
    )}>
      {navItems.map((item, index) => {
        const isActive = location.pathname === item.path || (item.path === '/browse' && location.pathname === '/');
        const hasNotification = false; // Disable mock notification dot as requested
        return (
          <Link
            key={index}
            to={item.path}
            className="flex flex-col items-center justify-center gap-1 w-[4rem] relative"
          >
            <div className="relative">
              <item.icon 
                size={22} 
                strokeWidth={isActive ? 2.5 : 2} 
                className={isActive ? "text-[#FF4D6D]" : "text-[#B4B4B8] hover:text-white transition-colors"}
                fill={isActive ? "currentColor" : "none"} 
              />
              {hasNotification && !isActive && (
                <div className="absolute 0 right-0 w-2 h-2 bg-[#FF4D6D] rounded-full border-[1.5px] border-[#2A2A2E]" />
              )}
            </div>
            <span className={cn(
              "text-[10px] font-medium transition-colors mt-0.5",
              isActive ? "text-[#FF4D6D]" : "text-[#B4B4B8]"
            )}>
              {item.label}
            </span>
            {isActive && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-[3px] rounded-full bg-[#FF4D6D] shadow-[0_0_8px_rgba(255,77,109,0.8)]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
