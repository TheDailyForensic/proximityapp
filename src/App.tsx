import React from "react";
import { AudioProvider, useAudio } from "./context/AudioContext";
import { SongUploader } from "./components/SongUploader";
import { PlaylistManager } from "./components/PlaylistManager";
import { LyricsViewer } from "./components/LyricsViewer";
import { Equalizer } from "./components/Equalizer";
import { Visualizer } from "./components/Visualizer";
import { MusicPlayer } from "./components/MusicPlayer";
import { FullscreenPlayer } from "./components/FullscreenPlayer";
import { themeStyles } from "./lib/theme";
import { Disc, Headphones, Radio, SwatchBook } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const THEME_OPTIONS = [
  { id: "red", name: "Crimson", color: "bg-red-500" },
  { id: "green", name: "Emerald", color: "bg-emerald-500" },
  { id: "blue", name: "Sapphire", color: "bg-blue-500" },
  { id: "orange", name: "Amber", color: "bg-orange-500" },
  { id: "slate", name: "Slate", color: "bg-slate-400" },
] as const;

function Dashboard() {
  const { theme, setTheme, isFullscreen, setIsFullscreen } = useAudio();
  const activeStyles = themeStyles[theme] || themeStyles.red;

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-100 flex flex-col font-sans select-none pb-32">
      
      {/* Premium Header - Streaming Vibe */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${activeStyles.bg} flex items-center justify-center shadow-lg shrink-0`}>
              <Radio className="w-5.5 h-5.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
                  .proximity+
                </h1>
              </div>
              <p className="text-xs text-zinc-500 font-medium">Interactive Audio Workspace & Library</p>
            </div>
          </div>

          {/* Theme Selector Toolbar */}
          <div className="flex items-center gap-3.5 bg-zinc-900/60 p-1 px-3.5 py-1.5 rounded-2xl border border-zinc-800">
            <SwatchBook className="w-4 h-4 text-zinc-400" />
            <div className="flex gap-2.5">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  className={`w-4 h-4 rounded-full transition-transform cursor-pointer relative ${opt.color} ${
                    theme === opt.id ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : "hover:scale-110 opacity-70 hover:opacity-100"
                  }`}
                  title={`${opt.name} Theme`}
                />
              ))}
            </div>
          </div>

        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Controls & Audiovisual feeds (5/12 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Visualizer Feed */}
          <div className="h-[280px]">
            <Visualizer />
          </div>

          {/* Playlist organizer */}
          <PlaylistManager />

          {/* Equalizer deck */}
          <Equalizer />

        </div>

        {/* RIGHT COLUMN: Library Uploads & Lyrics Lookup Console (7/12 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Lyrics Lookup & Timestamps Karaoke Terminal */}
          <LyricsViewer />

          {/* Library explorer & staging container */}
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-5 shadow-xl">
            <h3 className="font-bold text-sm md:text-base text-slate-100 mb-4 flex items-center gap-2">
              <Disc className={`w-4 h-4 ${activeStyles.text} animate-spin`} style={{ animationDuration: '6s' }} />
              Uploads & Streaming Library
            </h3>
            <SongUploader />
          </div>

        </div>

      </main>

      {/* FIXED BOTTOM MASTER PLAYER DECK */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-900/60 p-4 shadow-2xl">
        <div className="max-w-7xl mx-auto">
          <MusicPlayer />
        </div>
      </div>

      {/* FULLSCREEN OVERLAY PORTAL */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 25, stiffness: 180 }}
            className="fixed inset-0 z-50"
          >
            <FullscreenPlayer onClose={() => setIsFullscreen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function App() {
  return (
    <AudioProvider>
      <Dashboard />
    </AudioProvider>
  );
}
