import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { compressImageToDataUrl } from '../lib/geo';

interface CameraSnapModalProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CameraSnapModal({ onCapture, onClose }: CameraSnapModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Live camera preview is unavailable in this browser. Upload or capture a photo file below.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        if (active) {
          setCameraError('Camera access was not granted. You can still upload a photo from your device.');
        }
      }
    }
    void startCamera();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const handleShutter = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    setIsProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 960;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) throw new Error('Capture failed');
      const dataUrl = await compressImageToDataUrl(blob);
      onCapture(dataUrl);
      onClose();
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Could not process snap.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setCameraError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      onCapture(dataUrl);
      onClose();
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Could not process image file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-t-3xl sm:rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
        <div className="sm:hidden w-10 h-1 rounded-full bg-[#CBD5E1] mx-auto mt-2.5" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-base font-semibold text-[#0F172A]">Take a Travel Snap</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#475569] hover:text-[#0F172A] hover:bg-[#F6F7FB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!cameraError ? (
            <div className="relative rounded-xl overflow-hidden bg-[#0F172A] aspect-[4/3] flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!cameraReady && (
                <span className="absolute text-xs text-white/80">Starting viewfinder...</span>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-[#F6F7FB] border border-[#E2E8F0] p-6 text-center">
              <Camera className="w-7 h-7 text-[#4F46E5] mx-auto mb-2" />
              <p className="text-sm text-[#475569] leading-relaxed">{cameraError}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#0F172A] bg-[#F6F7FB] border border-[#E2E8F0] rounded-lg hover:bg-[#EEF1FA] cursor-pointer trail-transition">
              <Upload className="w-4 h-4 text-[#4F46E5]" />
              <span>Upload / Device Camera</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
                disabled={isProcessing}
              />
            </label>

            {!cameraError && (
              <button
                type="button"
                disabled={!cameraReady || isProcessing}
                onClick={() => void handleShutter()}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#5B21B6] via-[#4F46E5] to-[#2563EB] rounded-lg hover:from-[#4C1D95] hover:via-[#4338CA] hover:to-[#1D4ED8] disabled:opacity-50 cursor-pointer trail-transition"
              >
                <Camera className="w-4 h-4" />
                <span>{isProcessing ? 'Saving...' : 'Capture Snap'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
