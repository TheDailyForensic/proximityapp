import React, { useState } from "react";
import { useAudio } from "../context/AudioContext";
import { themeStyles, getThemeGradient } from "../lib/theme";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  List,
  Music,
  Maximize2,
} from "lucide-react";
import { motion } from "motion/react";
import { QueueManager } from "./QueueManager";

export const MusicPlayer: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    theme,
    isFullscreen,
    setIsFullscreen,
    togglePlay,
    seek,
    setVolumeLevel,
    toggleMute,
    toggleShuffle,
    setRepeatMode,
    nextSong,
    prevSong,
    queue,
    queueIndex,
  } = useAudio();

  const [showQueue, setShowQueue] = useState(false);

  const activeStyles = themeStyles[theme] || themeStyles.red;

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const cycleRepeatMode = () => {
    if (repeat === "none") {
      setRepeatMode("all");
    } else if (repeat === "all") {
      setRepeatMode("one");
    } else {
      setRepeatMode("none");
    }
  };

  if (!currentSong) {
    return (
      <div id="mini-player-empty" className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl text-center text-zinc-500 text-xs flex items-center justify-center min-h-[80px]">
        No song loaded. Select a track from your library to start streaming.
      </div>
    );
  }

  return (
    <div id="master-music-player" className="bg-zinc-950/40 border border-zinc-900/60 rounded-3xl p-4 md:p-5 text-slate-100 shadow-2xl flex flex-col gap-3.5 backdrop-blur-md">
      
      {/* Upper player display details */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Album Artwork representation and text info */}
        <div className="flex items-center gap-3.5 w-full sm:w-auto">
          <div className="relative w-11 h-11 md:w-13 md:h-13 rounded-xl shadow-lg flex items-center justify-center shrink-0 overflow-hidden border border-zinc-800">
            {currentSong.albumCover ? (
              <img 
                src={currentSong.albumCover} 
                alt={currentSong.title} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`w-full h-full rounded-xl flex items-center justify-center text-xs font-extrabold text-white uppercase shrink-0 bg-gradient-to-br ${getThemeGradient(theme, currentSong.title)}`}>
                {currentSong.title.slice(0, 2)}
              </div>
            )}
            
            {isPlaying && (
              <motion.div
                initial={{ opacity: 0.1 }}
                animate={{ opacity: [0.1, 0.35, 0.1] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                className={`absolute inset-0 ${activeStyles.bg}`}
              />
            )}
          </div>
          <div className="overflow-hidden w-full">
            <h4 className="font-bold text-sm md:text-base text-slate-100 truncate tracking-tight">{currentSong.title}</h4>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              {currentSong.artist} {currentSong.album && <span className="text-zinc-500 font-normal">• {currentSong.album}</span>}
            </p>
          </div>
        </div>

        {/* Playback Controls Panel */}
        <div className="flex items-center gap-4">
          
          {/* Shuffle Toggle */}
          <button
            id="player-shuffle"
            onClick={toggleShuffle}
            className={`p-2 rounded-xl transition-all cursor-pointer min-h-[38px] flex items-center justify-center ${
              shuffle
                ? `${activeStyles.text} ${activeStyles.pulseBg} border ${activeStyles.pulseBorder}`
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            title="Toggle Shuffle"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          {/* Previous Song */}
          <button
            id="player-prev"
            onClick={prevSong}
            className="p-2 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer min-h-[38px] flex items-center justify-center"
            title="Previous Song"
          >
            <SkipBack className="w-4.5 h-4.5 fill-current" />
          </button>

          {/* Play/Pause Trigger */}
          <button
            id="player-play-pause"
            onClick={togglePlay}
            className={`w-11 h-11 md:w-12 md:h-12 ${activeStyles.bg} ${activeStyles.hoverBg} text-white flex items-center justify-center rounded-full shadow-lg transition-all scale-105 active:scale-95 hover:scale-110 cursor-pointer min-h-[44px] ${activeStyles.glow}`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current text-white" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5 text-white" />
            )}
          </button>

          {/* Next Song */}
          <button
            id="player-next"
            onClick={nextSong}
            className="p-2 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer min-h-[38px] flex items-center justify-center"
            title="Next Song"
          >
            <SkipForward className="w-4.5 h-4.5 fill-current" />
          </button>

          {/* Repeat Mode Toggle */}
          <button
            id="player-repeat"
            onClick={cycleRepeatMode}
            className={`p-2 rounded-xl transition-all cursor-pointer min-h-[38px] flex items-center justify-center ${
              repeat !== "none"
                ? `${activeStyles.text} ${activeStyles.pulseBg} border ${activeStyles.pulseBorder}`
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            title={`Repeat mode: ${repeat}`}
          >
            {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>

        </div>

        {/* Volume & Fullscreen Trigger HUD */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          
          {/* Fullscreen Button */}
          <button
            id="toggle-fullscreen-button"
            onClick={() => setIsFullscreen(true)}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-slate-200 transition flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer min-h-[36px]"
            title="Open Fullscreen Theater"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Theater</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              id="player-mute"
              onClick={toggleMute}
              className="text-zinc-500 hover:text-zinc-300 p-1.5 cursor-pointer min-h-[36px]"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? <VolumeX className={`w-4 h-4 ${activeStyles.text} animate-pulse`} /> : <Volume2 className="w-4 h-4 text-zinc-400" />}
            </button>
            <input
              id="player-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
              className={`w-16 md:w-24 ${activeStyles.accent} cursor-pointer h-1 bg-zinc-800 rounded-lg`}
            />
          </div>

          <button
            id="player-queue-toggle"
            onClick={() => setShowQueue(!showQueue)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 rounded-xl text-[10px] font-mono text-zinc-400 hover:text-white transition cursor-pointer min-h-[36px]"
            title="Open Play Queue"
          >
            <List className={`w-3.5 h-3.5 ${activeStyles.text}`} />
            <span>TRACK {queueIndex + 1}/{queue.length}</span>
          </button>

        </div>

      </div>

      {/* Progress timeline seeker bar */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono text-zinc-500 select-none w-8 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          id="player-progress-slider"
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime}
          onChange={handleProgressChange}
          className={`flex-1 ${activeStyles.accent} cursor-pointer h-1 bg-zinc-800 rounded-lg`}
          style={{
            background: `linear-gradient(to right, ${theme === 'slate' ? '#94a3b8' : theme === 'blue' ? '#3b82f6' : theme === 'green' ? '#10b981' : theme === 'orange' ? '#f97316' : '#dc2626'} 0%, ${theme === 'slate' ? '#94a3b8' : theme === 'blue' ? '#3b82f6' : theme === 'green' ? '#10b981' : theme === 'orange' ? '#f97316' : '#dc2626'} ${(currentTime / (duration || 1)) * 100}%, #27272a ${(currentTime / (duration || 1)) * 100}%, #27272a 100%)`
          }}
        />
        <span className="text-[10px] font-mono text-zinc-500 select-none w-8 font-semibold">
          {formatTime(duration)}
        </span>
      </div>

      {/* Queue Drawer Component */}
      <QueueManager isOpen={showQueue} onClose={() => setShowQueue(false)} />

    </div>
  );
};
export default MusicPlayer;
