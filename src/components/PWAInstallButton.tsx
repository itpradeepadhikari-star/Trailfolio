import { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'footer';
}

export function PWAInstallButton({ variant = 'header' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  // In the header, display when native install prompt is available or on mobile (Android/iOS)
  if (variant === 'header' && !isInstallable && !isAndroid && !isIOS) {
    return null;
  }

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="inline-flex items-center gap-1.5 px-3 min-h-[40px] py-2 text-xs font-medium text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF] border border-[#C7D2FE] rounded-xl whitespace-nowrap shrink-0 cursor-pointer trail-transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="inline-flex items-center gap-1.5 hover:text-[#0F172A] cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#4F46E5]" />
          <span>{isInstallable ? 'Install Mobile App' : 'Android & iOS App'}</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-[#CBD5E1] mx-auto" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#4F46E5]">Install Trailfolio</p>
                <h3 className="text-lg font-semibold text-[#0F172A]">
                  {isIOS ? 'Install on iPhone / iPad' : 'Install on Android Phone'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#475569] hover:text-[#0F172A] hover:bg-[#F6F7FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 text-sm text-[#475569] leading-relaxed">
                <p>
                  1. Open this site in <strong className="text-[#0F172A]">Safari</strong>.
                </p>
                <p>
                  2. Tap the <strong className="text-[#0F172A]">Share</strong> button in the bottom
                  toolbar.
                </p>
                <p>
                  3. Scroll down and tap{' '}
                  <strong className="text-[#0F172A]">Add to Home Screen</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-[#475569] leading-relaxed">
                <div className="p-3.5 rounded-xl bg-[#F6F7FB] border border-[#E2E8F0] space-y-1.5">
                  <p className="text-xs font-semibold text-[#0F172A]">
                    Direct Android Install (Chrome)
                  </p>
                  <p className="text-xs leading-relaxed">
                    Open your live Netlify URL in <strong className="text-[#0F172A]">Chrome</strong>
                    , tap the <strong className="text-[#0F172A]">⋮ menu</strong> (top-right), and
                    choose <strong className="text-[#0F172A]">Install app</strong> or{' '}
                    <strong className="text-[#0F172A]">Add to Home screen</strong>.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#EEF2FF]/70 border border-[#C7D2FE] space-y-1.5">
                  <p className="text-xs font-semibold text-[#0F172A]">
                    Need an installable .APK file?
                  </p>
                  <p className="text-xs leading-relaxed">
                    Deploy this site to Netlify, paste your live URL into{' '}
                    <strong className="text-[#0F172A]">pwabuilder.com</strong>, and download the
                    generated Android <strong className="text-[#0F172A]">.apk</strong> package with
                    one click.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] text-white text-sm font-medium cursor-pointer trail-transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#0F172A] text-white border border-[#334155] px-3.5 py-2 text-xs font-medium shadow-lg">
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>Offline mode — cached data active</span>
    </div>
  );
}
