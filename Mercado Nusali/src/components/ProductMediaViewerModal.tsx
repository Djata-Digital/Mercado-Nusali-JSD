import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize,
  Minimize,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Film,
  Image as ImageIcon,
  Move,
  Check,
  Share2,
  Copy,
} from 'lucide-react';
import { ProductVideo } from '../types';

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  title?: string;
  thumbnail?: string;
  duration?: string;
}

interface ProductMediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: MediaItem[];
  initialIndex?: number;
  productTitle: string;
}

export const ProductMediaViewerModal: React.FC<ProductMediaViewerModalProps> = ({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
  productTitle,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Video state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Reset zoom & pan when switching media item
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setIsPlaying(true);
  }, [currentIndex]);

  const currentItem = items[currentIndex] || items[0];

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleDoubleClick = () => {
    if (currentItem?.type === 'video') return;
    if (scale > 1) {
      handleResetZoom();
    } else {
      setScale(2.5);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (currentItem?.type === 'video') return;
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev + 0.25, 4));
    } else {
      setScale((prev) => {
        const next = Math.max(prev - 0.25, 1);
        if (next === 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    }
  };

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1 || currentItem?.type === 'video') return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Keyboard navigation & controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0' || e.key === 'r') {
        handleResetZoom();
      } else if (e.key === 'f') {
        handleToggleFullscreen();
      } else if (e.key === ' ' && currentItem?.type === 'video' && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play();
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, currentItem, onClose]);

  // Video progress handlers
  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const curr = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 1;
      setCurrentTime(curr);
      setVideoDuration(dur);
      setVideoProgress((curr / dur) * 100);
    }
  };

  const handleTogglePlayVideo = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleMuteVideo = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleSeekVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const seekPercent = parseFloat(e.target.value);
    const newTime = (seekPercent / 100) * (videoRef.current.duration || 1);
    videoRef.current.currentTime = newTime;
    setVideoProgress(seekPercent);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!isOpen || !currentItem) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between text-white select-none animate-fadeIn"
      onWheel={handleWheel}
      onMouseUp={handleMouseUp}
    >
      {/* Top Bar Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-black/50 border-b border-white/10 z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0 pr-4">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 shrink-0">
            {currentItem.type === 'video' ? (
              <Film className="w-4 h-4" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-gray-100 truncate max-w-md sm:max-w-xl">
              {productTitle}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
              <span>
                {currentItem.type === 'video'
                  ? `Vídeo Curto (${currentIndex + 1} de ${items.length})`
                  : `Foto ${currentIndex + 1} de ${items.length}`}
              </span>
              {scale > 1 && currentItem.type === 'image' && (
                <span className="bg-emerald-600/30 text-emerald-300 font-bold px-1.5 py-0.2 rounded text-[10px] border border-emerald-500/40">
                  {Math.round(scale * 100)}% Zoom
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {currentItem.type === 'image' && (
            <>
              <button
                onClick={handleZoomOut}
                disabled={scale <= 1}
                className={`p-2 rounded-xl border border-white/10 bg-white/5 transition ${
                  scale <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/15 text-white'
                }`}
                title="Diminuir Zoom (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <button
                onClick={handleZoomIn}
                disabled={scale >= 4}
                className={`p-2 rounded-xl border border-white/10 bg-white/5 transition ${
                  scale >= 4 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/15 text-white'
                }`}
                title="Aumentar Zoom (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                onClick={handleResetZoom}
                className="hidden sm:flex p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition"
                title="Redefinir Zoom (100%)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={handleRotate}
                className="hidden sm:flex p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition"
                title="Girar 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={handleCopyLink}
            className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition flex items-center gap-1 text-xs"
            title="Copiar link do produto"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="hidden md:inline text-[11px] text-emerald-400 font-bold">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span className="hidden md:inline text-[11px]">Copiar Link</span>
              </>
            )}
          </button>

          <button
            onClick={handleToggleFullscreen}
            className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition"
            title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-bold transition ml-1"
            title="Fechar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden cursor-default"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        {/* Navigation Arrows */}
        {items.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center shadow-2xl transition hover:scale-105 active:scale-95"
              title="Anterior (Seta Esquerda)"
            >
              <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center shadow-2xl transition hover:scale-105 active:scale-95"
              title="Próxima (Seta Direita)"
            >
              <ChevronRight className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          </>
        )}

        {/* Media Content Display */}
        {currentItem.type === 'video' ? (
          <div className="relative max-w-4xl w-full max-h-[75vh] flex flex-col items-center justify-center p-4">
            <video
              ref={videoRef}
              src={currentItem.url}
              autoPlay
              loop
              playsInline
              onTimeUpdate={handleVideoTimeUpdate}
              onClick={handleTogglePlayVideo}
              className="max-h-[65vh] w-auto max-w-full rounded-2xl shadow-2xl bg-black border border-white/10 cursor-pointer object-contain"
            />

            {/* Video Controls Bar */}
            <div className="w-full max-w-xl mt-3 bg-black/80 backdrop-blur-md rounded-2xl p-3 border border-white/15 flex items-center gap-3 shadow-xl">
              <button
                onClick={handleTogglePlayVideo}
                className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition"
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              <span className="text-[11px] font-mono text-gray-300 min-w-[70px]">
                {formatSeconds(currentTime)} / {formatSeconds(videoDuration)}
              </span>

              <input
                type="range"
                min="0"
                max="100"
                value={videoProgress}
                onChange={handleSeekVideo}
                className="flex-1 accent-emerald-500 h-1.5 bg-gray-700 rounded-lg cursor-pointer"
              />

              <button
                onClick={handleToggleMuteVideo}
                className="p-1.5 text-gray-300 hover:text-white rounded-lg transition"
                title={isMuted ? 'Desmutar' : 'Mutar'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center p-4 transition-transform ${
              scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            }`}
            onDoubleClick={handleDoubleClick}
          >
            <img
              ref={imageRef}
              src={currentItem.url}
              alt={productTitle}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
              draggable={false}
              className="max-h-[78vh] max-w-[85vw] object-contain rounded-lg drop-shadow-2xl select-none"
            />
          </div>
        )}

        {/* Floating Hint Overlay */}
        {currentItem.type === 'image' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-[11px] text-gray-300 flex items-center gap-2 pointer-events-none hidden sm:flex">
            <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
            <span>Duplo clique ou scroll para dar zoom • Arraste para mover</span>
          </div>
        )}
      </div>

      {/* Bottom Thumbnails Filmstrip */}
      <div className="bg-black/60 backdrop-blur-md border-t border-white/10 px-4 py-3 z-20 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2.5 overflow-x-auto no-scrollbar py-1">
          {items.map((item, idx) => {
            const active = idx === currentIndex;
            return (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all p-0.5 bg-black/40 ${
                  active
                    ? 'border-emerald-400 ring-2 ring-emerald-500/40 scale-105 shadow-lg'
                    : 'border-white/20 opacity-60 hover:opacity-100 hover:border-white/50'
                }`}
              >
                {item.type === 'video' ? (
                  <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center relative">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-5 h-5 text-emerald-400" />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/90 text-white flex items-center justify-center">
                        <Play className="w-3 h-3 fill-white ml-0.5" />
                      </div>
                    </div>
                    {item.duration && (
                      <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] font-mono px-1 rounded text-white">
                        {item.duration}
                      </span>
                    )}
                  </div>
                ) : (
                  <img src={item.url} alt="" className="w-full h-full object-contain bg-black/20" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
