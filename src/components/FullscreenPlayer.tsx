import React, { useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioContext";
import { themeStyles, getThemeGradient } from "../lib/theme";
import { 
  X, Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, 
  Volume2, VolumeX, Minimize2, Music, Activity, Layers, Radio,
  List
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QueueManager } from "./QueueManager";

interface FullscreenPlayerProps {
  onClose: () => void;
}

type DisplayChoice = "lyrics" | "visualizer" | "both";
type VisualStyle = "bars" | "wave" | "circle" | "led";

export const FullscreenPlayer: React.FC<FullscreenPlayerProps> = ({ onClose }) => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    analyserNode,
    theme,
    togglePlay,
    seek,
    nextSong,
    prevSong,
    toggleShuffle,
    setRepeatMode,
    setVolumeLevel,
    toggleMute,
    queue,
    queueIndex,
  } = useAudio();

  const [displayMode, setDisplayMode] = useState<DisplayChoice>("both");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("led");
  const [showQueue, setShowQueue] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Translation states
  const [translationLang, setTranslationLang] = useState<string>("");
  const [translatedSynced, setTranslatedSynced] = useState<{ time: number; text: string }[]>([]);
  const [translating, setTranslating] = useState<boolean>(false);

  useEffect(() => {
    setTranslationLang("");
    setTranslatedSynced([]);
  }, [currentSong?.id]);

  const handleTranslate = async (lang: string) => {
    if (!currentSong) return;
    if (!lang) {
      setTranslationLang("");
      setTranslatedSynced([]);
      return;
    }

    setTranslating(true);
    setTranslationLang(lang);

    try {
      const res = await fetch("/api/lyrics/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics: currentSong.lyrics || (currentSong.syncedLyrics || []).map((l) => l.text).join("\n"),
          syncedLyrics: currentSong.syncedLyrics || [],
          language: lang,
        }),
      });

      if (!res.ok) {
        throw new Error("Translation failed");
      }

      const data = await res.json();
      if (data.translatedSynced && data.translatedSynced.length > 0) {
        setTranslatedSynced(data.translatedSynced);
      } else {
        alert("Could not translate synced timeline lyrics.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to translate lyrics. Please try again.");
      setTranslationLang("");
    } finally {
      setTranslating(false);
    }
  };

  const activeStyles = themeStyles[theme] || themeStyles.red;

  // Sync lyrics lines
  const syncedLyrics = currentSong?.syncedLyrics || [];
  const displayLyrics = translationLang && translatedSynced.length > 0
    ? translatedSynced
    : syncedLyrics;
  const hasLyrics = syncedLyrics.length > 0;
  const effectiveDisplayMode = hasLyrics ? displayMode : "visualizer";

  const activeLineIndex = displayLyrics.findIndex((line, i) => {
    const nextLine = displayLyrics[i + 1];
    return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
  });

  // Auto-scroll lyrics
  useEffect(() => {
    if (activeLineIndex === -1) return;
    const activeEl = document.getElementById(`full-lyric-${activeLineIndex}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIndex, effectiveDisplayMode]);

  // Handle Canvas Resize
  const [dimensions, setDimensions] = useState({ width: 400, height: 250 });
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 100),
        height: Math.max(height, 100),
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [effectiveDisplayMode]);

  // Real-time Canvas Rendering Loop
  useEffect(() => {
    if (effectiveDisplayMode === "lyrics") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const width = dimensions.width;
    const height = dimensions.height;

    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      if (analyserNode && isPlaying) {
        if (visualStyle === "wave") {
          analyserNode.getByteTimeDomainData(dataArray);
        } else {
          analyserNode.getByteFrequencyData(dataArray);
        }
      } else {
        // Ambient fallback state
        for (let i = 0; i < bufferLength; i++) {
          if (visualStyle === "wave") {
            dataArray[i] = 128 + Math.sin(i * 0.1) * 3;
          } else {
            dataArray[i] = Math.max(4, Math.sin(i * 0.2) * 6 + 4);
          }
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Render styles
      if (visualStyle === "bars") {
        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * (height - 20);
          
          const percent = i / bufferLength;
          // Dynamically adjust color according to selected theme
          let hslaColor = `hsla(0, 95%, 55%, ${isPlaying ? 0.95 : 0.45})`;
          if (theme === "green") {
            hslaColor = `hsla(142, 70%, 45%, ${isPlaying ? 0.95 : 0.45})`;
          } else if (theme === "blue") {
            hslaColor = `hsla(217, 91%, 56%, ${isPlaying ? 0.95 : 0.45})`;
          } else if (theme === "orange") {
            hslaColor = `hsla(24, 94%, 50%, ${isPlaying ? 0.95 : 0.45})`;
          } else if (theme === "slate") {
            hslaColor = `hsla(240, 5%, 65%, ${isPlaying ? 0.95 : 0.45})`;
          }

          ctx.fillStyle = hslaColor;
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight - 5, barWidth - 1, barHeight + 5, [2, 2, 0, 0]);
          ctx.fill();

          x += barWidth;
        }
      } else if (visualStyle === "wave") {
        ctx.lineWidth = 3;
        let strokeColor = "#dc2626";
        if (theme === "green") strokeColor = "#10b981";
        else if (theme === "blue") strokeColor = "#3b82f6";
        else if (theme === "orange") strokeColor = "#f97316";
        else if (theme === "slate") strokeColor = "#cbd5e1";

        ctx.strokeStyle = strokeColor;
        ctx.shadowBlur = isPlaying ? 12 : 2;
        ctx.shadowColor = strokeColor;

        ctx.beginPath();
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow
      } else if (visualStyle === "circle") {
        const centerX = width / 2;
        const centerY = height / 2;
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avgVolume = sum / bufferLength;
        const pulse = (avgVolume / 255) * 30;
        const baseRadius = Math.min(width, height) * 0.2 + pulse;

        // Halo circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius * 1.2, 0, 2 * Math.PI);
        let haloColor = "rgba(220, 38, 38, 0.15)";
        if (theme === "green") haloColor = "rgba(16, 185, 129, 0.15)";
        else if (theme === "blue") haloColor = "rgba(59, 130, 246, 0.15)";
        else if (theme === "orange") haloColor = "rgba(249, 115, 22, 0.15)";
        else if (theme === "slate") haloColor = "rgba(203, 213, 225, 0.15)";

        ctx.strokeStyle = haloColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Rays
        const numRays = Math.min(bufferLength, 60);
        for (let i = 0; i < numRays; i++) {
          const angle = (i / numRays) * Math.PI * 2;
          const amplitude = (dataArray[i] / 255) * 45;
          
          const startX = centerX + Math.cos(angle) * baseRadius;
          const startY = centerY + Math.sin(angle) * baseRadius;
          const endX = centerX + Math.cos(angle) * (baseRadius + amplitude);
          const endY = centerY + Math.sin(angle) * (baseRadius + amplitude);

          let rayColor = `hsla(0, 95%, 55%, ${isPlaying ? 0.8 : 0.3})`;
          if (theme === "green") {
            rayColor = `hsla(142, 70%, 45%, ${isPlaying ? 0.8 : 0.3})`;
          } else if (theme === "blue") {
            rayColor = `hsla(217, 91%, 56%, ${isPlaying ? 0.8 : 0.3})`;
          } else if (theme === "orange") {
            rayColor = `hsla(24, 94%, 50%, ${isPlaying ? 0.8 : 0.3})`;
          } else if (theme === "slate") {
            rayColor = `hsla(240, 5%, 65%, ${isPlaying ? 0.8 : 0.3})`;
          }

          ctx.strokeStyle = rayColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }

        // Core
        const circleGrad = ctx.createRadialGradient(centerX, centerY, 3, centerX, centerY, baseRadius);
        if (theme === "green") {
          circleGrad.addColorStop(0, "rgba(16, 185, 129, 0.95)");
          circleGrad.addColorStop(1, "rgba(4, 120, 87, 0.85)");
        } else if (theme === "blue") {
          circleGrad.addColorStop(0, "rgba(59, 130, 246, 0.95)");
          circleGrad.addColorStop(1, "rgba(29, 78, 216, 0.85)");
        } else if (theme === "orange") {
          circleGrad.addColorStop(0, "rgba(249, 115, 22, 0.95)");
          circleGrad.addColorStop(1, "rgba(194, 65, 12, 0.85)");
        } else if (theme === "slate") {
          circleGrad.addColorStop(0, "rgba(148, 163, 184, 0.95)");
          circleGrad.addColorStop(1, "rgba(71, 85, 105, 0.85)");
        } else {
          circleGrad.addColorStop(0, "rgba(220, 38, 38, 0.95)");
          circleGrad.addColorStop(1, "rgba(185, 28, 28, 0.85)");
        }

        ctx.fillStyle = circleGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, 2 * Math.PI);
        ctx.fill();
      } else if (visualStyle === "led") {
        const numCols = 24;
        const numRows = 10;
        const colWidth = width / numCols;
        const rowHeight = height / numRows;

        for (let c = 0; c < numCols; c++) {
          const amplitude = dataArray[c] / 255;
          const activeRows = Math.floor(amplitude * numRows);

          for (let r = 0; r < numRows; r++) {
            const rowIndexFromBottom = numRows - 1 - r;
            const isLit = rowIndexFromBottom < activeRows;

            let ledColor = "rgba(255, 255, 255, 0.05)";
            if (!isLit) {
              if (theme === "green") {
                ledColor = "rgba(16, 185, 129, 0.05)";
              } else if (theme === "blue") {
                ledColor = "rgba(59, 130, 246, 0.05)";
              } else if (theme === "orange") {
                ledColor = "rgba(249, 115, 22, 0.05)";
              } else if (theme === "slate") {
                ledColor = "rgba(148, 163, 184, 0.05)";
              } else {
                ledColor = "rgba(220, 38, 38, 0.05)";
              }
            } else {
              // Classic authentic LED colors
              if (r < 3) {
                ledColor = "rgba(239, 68, 68, 0.95)"; // Red
              } else if (r < 5) {
                ledColor = "rgba(245, 158, 11, 0.95)"; // Orange/Yellow
              } else {
                ledColor = "rgba(16, 185, 129, 0.95)"; // Green
              }
            }

            ctx.fillStyle = ledColor;
            ctx.fillRect(
              c * colWidth + 1.5,
              r * rowHeight + 1.5,
              colWidth - 3,
              rowHeight - 3
            );
          }
        }
      }
    };

    draw();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [effectiveDisplayMode, visualStyle, dimensions, isPlaying, analyserNode, theme]);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  if (!currentSong) return null;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 text-slate-100 flex flex-col justify-between overflow-hidden select-none">
      
      {/* Background Cover Blur Effect (YTM Signature style) */}
      <div className="absolute inset-0 pointer-events-none opacity-25 z-0 overflow-hidden">
        {currentSong.albumCover ? (
          <img 
            src={currentSong.albumCover} 
            alt="Blur BG" 
            className="w-full h-full object-cover scale-150 blur-[120px] saturate-150" 
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={`w-full h-full blur-[120px] bg-gradient-to-br ${getThemeGradient(theme, currentSong.title)}`} />
        )}
      </div>

      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between px-6 py-4 z-10 border-b border-white/5 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg bg-white/10`}>
            <Music className={`w-5 h-5 ${activeStyles.text}`} />
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">Now Playing</span>
            <h2 className="text-sm font-semibold text-slate-200">Fullscreen Theater</h2>
          </div>
        </div>

        {/* Display Choice Switcher */}
        {hasLyrics && (
          <div className="flex bg-black/60 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setDisplayMode("lyrics")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[32px] flex items-center gap-1 ${
                displayMode === "lyrics" ? `${activeStyles.bg} text-white` : "text-zinc-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Lyrics
            </button>
            <button
              onClick={() => setDisplayMode("visualizer")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[32px] flex items-center gap-1 ${
                displayMode === "visualizer" ? `${activeStyles.bg} text-white` : "text-zinc-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Visualizer
            </button>
            <button
              onClick={() => setDisplayMode("both")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer min-h-[32px] flex items-center gap-1 ${
                displayMode === "both" ? `${activeStyles.bg} text-white` : "text-zinc-400 hover:text-slate-200"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Split View
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            id="fullscreen-queue-toggle"
            onClick={() => setShowQueue(!showQueue)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition min-h-[32px]"
            title="Open Play Queue"
          >
            <List className={`w-3.5 h-3.5 ${activeStyles.text}`} />
            <span>Queue ({queue.length})</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition text-zinc-400 hover:text-white cursor-pointer"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 md:p-8 z-10 min-h-0 items-center">
        
        {/* Left Side: Artwork & Player Controls (Col 5) */}
        <div className="lg:col-span-5 flex flex-col justify-center gap-6 h-full max-w-md mx-auto w-full">
          
          {/* Album Art Frame */}
          <div className="relative aspect-square w-full max-w-[320px] md:max-w-[340px] mx-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 group bg-zinc-900 flex items-center justify-center">
            {currentSong.albumCover ? (
              <img 
                src={currentSong.albumCover} 
                alt={currentSong.title} 
                className="w-full h-full object-cover transition duration-700"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`w-full h-full flex flex-col items-center justify-center text-4xl font-extrabold text-white uppercase bg-gradient-to-br ${getThemeGradient(theme, currentSong.title)}`}>
                <span>{currentSong.title.slice(0, 2)}</span>
                <Music className="w-10 h-10 text-white/50 mt-2" />
              </div>
            )}
          </div>

          {/* Details & Playback Controls */}
          <div className="flex flex-col gap-4">
            <div className="text-center lg:text-left">
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate">
                {currentSong.title}
              </h1>
              <p className={`text-sm md:text-base ${activeStyles.text} font-bold mt-1 truncate`}>
                {currentSong.artist}
              </p>
              <p className="text-xs text-zinc-500 font-medium mt-0.5 truncate">
                {currentSong.album || "Unknown Album"}
              </p>
            </div>

            {/* Slider Seek Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seek(parseFloat(e.target.value))}
                  className={`w-full h-1.5 rounded-lg bg-zinc-800 outline-none cursor-pointer appearance-none ${activeStyles.accent}`}
                  style={{
                    background: `linear-gradient(to right, ${theme === 'slate' ? '#94a3b8' : theme === 'blue' ? '#3b82f6' : theme === 'green' ? '#10b981' : theme === 'orange' ? '#f97316' : '#dc2626'} 0%, ${theme === 'slate' ? '#94a3b8' : theme === 'blue' ? '#3b82f6' : theme === 'green' ? '#10b981' : theme === 'orange' ? '#f97316' : '#dc2626'} ${(currentTime / (duration || 1)) * 100}%, #27272a ${(currentTime / (duration || 1)) * 100}%, #27272a 100%)`
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-500 font-semibold">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Main Player Transport Panel */}
            <div className="flex items-center justify-center lg:justify-between gap-4">
              <button
                onClick={toggleShuffle}
                className={`p-2 transition rounded-full ${
                  shuffle ? `${activeStyles.text} bg-white/5` : "text-zinc-500 hover:text-white"
                }`}
                title="Shuffle queue"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={prevSong}
                  className="p-3 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-200 hover:text-white rounded-full transition duration-150 cursor-pointer"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>

                <button
                  onClick={togglePlay}
                  className={`p-5 ${activeStyles.bg} ${activeStyles.hoverBg} active:scale-95 text-white rounded-full transition duration-150 cursor-pointer shadow-lg ${activeStyles.glow}`}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={nextSong}
                  className="p-3 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-200 hover:text-white rounded-full transition duration-150 cursor-pointer"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>

              <button
                onClick={() => {
                  if (repeat === "none") setRepeatMode("all");
                  else if (repeat === "all") setRepeatMode("one");
                  else setRepeatMode("none");
                }}
                className={`p-2 transition rounded-full relative ${
                  repeat !== "none" ? `${activeStyles.text} bg-white/5` : "text-zinc-500 hover:text-white"
                }`}
                title="Repeat mode"
              >
                <Repeat className="w-5 h-5" />
                {repeat === "one" && (
                  <span className={`absolute -top-0.5 -right-0.5 text-[8px] px-1 font-bold ${activeStyles.bg} text-white rounded-full`}>
                    1
                  </span>
                )}
              </button>
            </div>

            {/* Quick Volume control */}
            <div className="flex items-center justify-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
              <button
                onClick={toggleMute}
                className="text-zinc-400 hover:text-white transition"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
                className={`w-28 h-1 bg-zinc-800 rounded outline-none appearance-none cursor-pointer ${activeStyles.accent}`}
              />
            </div>

          </div>
        </div>

        {/* Right Side: Lyrics / Visualizer Component (Col 7) */}
        <div className="lg:col-span-7 flex flex-col h-full min-h-[300px] lg:min-h-0 bg-black/40 border border-white/5 rounded-3xl p-4 md:p-6 overflow-hidden relative">
          
          {effectiveDisplayMode === "both" && (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              
              {/* Top half: Visualizer */}
              <div ref={containerRef} className="h-2/5 min-h-[120px] bg-black/30 border border-white/5 rounded-2xl relative overflow-hidden flex flex-col justify-between p-2">
                <div className="flex items-center justify-between z-10 px-2 py-1">
                  <span className="text-[10px] text-zinc-400 tracking-wider font-mono flex items-center gap-1">
                    <Activity className={`w-3 h-3 ${activeStyles.text}`} />
                    REACTIVE IMPULSE
                  </span>
                  <div className="flex bg-black/80 p-0.5 rounded-lg border border-white/10 gap-0.5 scale-90">
                    {(["bars", "wave", "circle", "led"] as VisualStyle[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => setVisualStyle(st)}
                        className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition cursor-pointer capitalize ${
                          visualStyle === st ? `${activeStyles.bg} text-white` : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
              </div>

              {/* Bottom half: Synced scrolling Lyrics */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                  <span className="text-[10px] text-zinc-500 tracking-wider font-mono uppercase">
                    TIMELINE SYNCED LRC
                  </span>
                  {syncedLyrics.length > 0 && (
                    <div className="relative">
                      <select
                        id="fullscreen-both-translate-select"
                        value={translationLang}
                        onChange={(e) => handleTranslate(e.target.value)}
                        disabled={translating}
                        className="bg-black/40 hover:bg-black/60 text-zinc-400 hover:text-slate-200 text-[10px] font-semibold rounded-lg px-2 py-0.5 outline-none border border-white/10 transition cursor-pointer pr-1"
                      >
                        <option value="">Translate...</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="Japanese">Japanese</option>
                        <option value="German">German</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Tamil">Tamil</option>
                        <option value="Korean">Korean</option>
                        <option value="Chinese">Chinese</option>
                      </select>
                      {translating && (
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                {syncedLyrics.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-600 gap-2 p-4">
                    <Layers className="w-8 h-8 text-zinc-800" />
                    <p className="text-xs">No synchronization track for this song</p>
                    <p className="text-[10px] text-zinc-700">Find or adjust lyrics in the normal editor view.</p>
                  </div>
                ) : (
                  <div 
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto px-4 py-8 flex flex-col gap-6 items-center select-none scrollbar-none scroll-smooth"
                  >
                    {displayLyrics.map((line, idx) => {
                      const isActive = idx === activeLineIndex;
                      return (
                        <button
                          key={idx}
                          id={`full-lyric-${idx}`}
                          onClick={() => seek(line.time + 0.05)}
                          className={`text-center transition-all duration-300 max-w-full text-base md:text-lg font-bold tracking-tight focus:outline-none cursor-pointer ${
                            isActive
                              ? "text-slate-100 scale-105 drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]"
                              : "text-zinc-600 hover:text-zinc-400 scale-95 opacity-40"
                          }`}
                        >
                          {line.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {effectiveDisplayMode === "lyrics" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                <span className="text-[10px] text-zinc-500 tracking-wider font-mono uppercase">
                  TIMELINE SYNCED LRC
                </span>
                {syncedLyrics.length > 0 && (
                  <div className="relative">
                    <select
                      id="fullscreen-lyrics-translate-select"
                      value={translationLang}
                      onChange={(e) => handleTranslate(e.target.value)}
                      disabled={translating}
                      className="bg-black/40 hover:bg-black/60 text-zinc-400 hover:text-slate-200 text-[10px] font-semibold rounded-lg px-2 py-0.5 outline-none border border-white/10 transition cursor-pointer pr-1"
                    >
                      <option value="">Translate...</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                      <option value="Japanese">Japanese</option>
                      <option value="German">German</option>
                      <option value="Hindi">Hindi</option>
                      <option value="Tamil">Tamil</option>
                      <option value="Korean">Korean</option>
                      <option value="Chinese">Chinese</option>
                    </select>
                    {translating && (
                      <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {syncedLyrics.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-600 gap-2">
                  <Layers className="w-8 h-8 text-zinc-800" />
                  <p className="text-sm">No synchronization track for this song</p>
                  <p className="text-xs text-zinc-700">Find or adjust lyrics in the normal editor view.</p>
                </div>
              ) : (
                <div 
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto px-4 py-16 flex flex-col gap-8 items-center select-none scrollbar-none scroll-smooth"
                >
                  {displayLyrics.map((line, idx) => {
                    const isActive = idx === activeLineIndex;
                    return (
                      <button
                        key={idx}
                        id={`full-lyric-${idx}`}
                        onClick={() => seek(line.time + 0.05)}
                        className={`text-center transition-all duration-300 max-w-full text-xl md:text-2xl font-bold tracking-tight focus:outline-none cursor-pointer ${
                          isActive
                            ? "text-slate-100 scale-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                            : "text-zinc-600 hover:text-zinc-400 scale-95 opacity-30"
                        }`}
                      >
                        {line.text}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {effectiveDisplayMode === "visualizer" && (
            <div ref={containerRef} className="flex-1 w-full h-full bg-black/20 border border-white/5 rounded-2xl relative overflow-hidden flex flex-col justify-between p-4 min-h-[220px]">
              <div className="flex items-center justify-between z-10">
                <span className="text-xs text-zinc-400 tracking-wider font-mono flex items-center gap-1">
                  <Activity className={`w-4 h-4 ${activeStyles.text} animate-pulse`} />
                  SPECTRUM VISUALIZATION
                </span>
                <div className="flex bg-black/80 p-1 rounded-xl border border-white/10 gap-1">
                  {(["bars", "wave", "circle", "led"] as VisualStyle[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => setVisualStyle(st)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer capitalize ${
                        visualStyle === st ? `${activeStyles.bg} text-white` : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
            </div>
          )}

        </div>

      </div>

      {/* Footer copyright style */}
      <div className="px-6 py-3 text-center text-[10px] text-zinc-600 border-t border-white/5 bg-black/20 z-10 font-mono">
        .proximity+ THEATER MODE
      </div>

      {/* Queue Drawer Component */}
      <QueueManager isOpen={showQueue} onClose={() => setShowQueue(false)} />

    </div>
  );
};
export default FullscreenPlayer;
