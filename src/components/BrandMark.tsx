type BrandMarkProps = {
  size?: number;
  className?: string;
  textClassName?: string;
};

export function BrandMark({ size = 84, className = '', textClassName = '' }: BrandMarkProps) {
  return (
    <div
      className={`rounded-full bg-[#E7273A] flex items-center justify-center shadow-[0_18px_44px_rgba(231,39,58,0.38)] ${className}`.trim()}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label="Drate logo"
      role="img"
    >
      <span className={`text-white font-black leading-none tracking-[-0.02em] ${textClassName}`.trim()}>D</span>
    </div>
  );
}
