import { BrandMark } from './BrandMark';

export function StartupSplash() {
  return (
    <div className="min-h-[100dvh] bg-[#131315] flex flex-col items-center justify-center gap-5">
      <BrandMark size={84} className="startup-logo-pulse" textClassName="text-[46px]" />
      <h1 className="startup-logo-pulse text-[34px] font-black tracking-tight text-[#F0EEE8]">Drate</h1>
    </div>
  );
}
