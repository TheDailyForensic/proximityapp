import React, { useState, useEffect, useRef } from "react";
import { useAudio } from "../context/AudioContext";
import { themeStyles, getThemeGradient } from "../lib/theme";
import { Play, Search, HelpCircle, Save, Music, AlertCircle, RefreshCw, Layers } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const LyricsViewer: React.FC = () => {
  const { currentSong, currentTime, updateSongLyrics, seek, isPlaying, theme } = useAudio();
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [searchPrompt, setSearchPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedSyncedLines, setEditedSyncedLines] = useState<{ time: number; text: string }[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Translation states
  const [translationLang, setTranslationLang] = useState<string>("");
  const [translatedSynced, setTranslatedSynced] = useState<{ time: number; text: string }[]>([]);
  const [translating, setTranslating] = useState<boolean>(false);

  const activeStyles = themeStyles[theme] || themeStyles.red;

  // Sync edits when song changes
  useEffect(() => {
    if (currentSong) {
      setEditedSyncedLines(currentSong.syncedLyrics || []);
      setIsEditing(false);
      setTranslationLang("");
      setTranslatedSynced([]);
    }
  }, [currentSong]);

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

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (!currentSong) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "lrc" && ext !== "srt" && ext !== "txt") {
      alert("Unsupported file type. Please drop an .lrc, .srt, or .txt file.");
      return;
    }

    setLoading(true);
    setLoadingMsg("AI processing and syncing dropped lyrics...");

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        if (!text) {
          setLoading(false);
          return;
        }

        try {
          const res = await fetch("/api/lyrics/sync-dropped", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: currentSong.title,
              artist: currentSong.artist === "Unknown Artist" ? "" : currentSong.artist,
              duration: currentSong.duration,
              fileType: ext,
              fileContent: text,
            }),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Failed to parse dropped lyrics file.");
          }

          const data = await res.json();
          const parsedSynced = (data.syncedLyrics || []).map((l: any) => ({
            time: parseFloat(l.time) || 0,
            text: String(l.text || ""),
          })).sort((a: any, b: any) => a.time - b.time);

          await updateSongLyrics(currentSong.id, data.lyrics, parsedSynced, data.title, data.artist);
          setEditedSyncedLines(parsedSynced);
        } catch (err: any) {
          alert(err.message || "Failed to parse and sync file. Please try again.");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("FileReader failed:", err);
      setLoading(false);
    }
  };

  // Find active line index based on playback time
  const activeLineIndex = currentSong?.syncedLyrics
    ? currentSong.syncedLyrics.findIndex((line, i) => {
        const nextLine = currentSong.syncedLyrics[i + 1];
        return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
      })
    : -1;

  // Auto-scroll the active line into center view
  useEffect(() => {
    if (activeLineIndex === -1 || isEditing) return;
    const activeEl = document.getElementById(`lyric-line-${activeLineIndex}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLineIndex, isEditing]);

  const loadingPrompts = [
    "Analyzing track metadata...",
    "Querying official lyrics database...",
    "Generating timing maps...",
    "Synchronizing lines with playback...",
    "Optimizing LRC performance timeline...",
  ];

  // Lookup lyrics using the API and save automatically!
  const handleLookupLyrics = async () => {
    if (!currentSong) return;
    setLoading(true);
    
    let timerIdx = 0;
    setLoadingMsg(loadingPrompts[0]);
    const timer = setInterval(() => {
      timerIdx = (timerIdx + 1) % loadingPrompts.length;
      setLoadingMsg(loadingPrompts[timerIdx]);
    }, 2000);

    try {
      const res = await fetch("/api/lyrics/find", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: currentSong.title,
          artist: currentSong.artist === "Unknown Artist" ? "" : currentSong.artist,
          duration: currentSong.duration,
          prompt: searchPrompt,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Could not find lyrics.");
      }

      const data = await res.json();
      
      const parsedSynced = (data.syncedLyrics || []).map((l: any) => ({
        time: parseFloat(l.time) || 0,
        text: String(l.text || ""),
      })).sort((a: any, b: any) => a.time - b.time);

      // Save directly to database & sync with context, updating metadata with corrected values
      await updateSongLyrics(currentSong.id, data.lyrics, parsedSynced, data.title, data.artist);
      setEditedSyncedLines(parsedSynced);
    } catch (err: any) {
      alert(err.message || "Failed to find lyrics. You can refine your search in the input below.");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!currentSong) return;
    const sortedSyncedLines = [...editedSyncedLines]
      .map((l) => ({
        time: parseFloat(l.time as any) || 0,
        text: String(l.text || ""),
      }))
      .sort((a, b) => a.time - b.time);

    const plainText = sortedSyncedLines.map((l) => l.text).join("\n");
    await updateSongLyrics(currentSong.id, plainText, sortedSyncedLines);
    setIsEditing(false);
  };

  const handleSyncedLineChange = (idx: number, field: "time" | "text", val: any) => {
    const updated = [...editedSyncedLines];
    updated[idx] = { ...updated[idx], [field]: val };
    setEditedSyncedLines(updated);
  };

  if (!currentSong) {
    return (
      <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-8 text-center text-zinc-500 flex flex-col items-center justify-center min-h-[400px] shadow-2xl relative overflow-hidden">
        {/* Glow ambient design */}
        <div className={`absolute -top-12 -left-12 w-48 h-48 ${theme === 'slate' ? 'bg-zinc-700/10' : theme === 'blue' ? 'bg-blue-600/10' : theme === 'green' ? 'bg-emerald-600/10' : theme === 'orange' ? 'bg-orange-600/10' : 'bg-red-600/10'} rounded-full blur-3xl`} />
        
        <Music className="w-12 h-12 text-zinc-800 mb-3 animate-pulse" />
        <h3 className="font-bold text-slate-200 text-base">Streaming Dashboard</h3>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
          Upload and play a song from your library to display real-time synchronized karaoke lyrics.
        </p>
      </div>
    );
  }

  const hasSyncedLyrics = currentSong.syncedLyrics && currentSong.syncedLyrics.length > 0;
  const displayLyrics = translationLang && translatedSynced.length > 0
    ? translatedSynced
    : currentSong.syncedLyrics || [];

  return (
    <div 
      id="lyrics-viewer-container" 
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleFileDrop}
      className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 flex flex-col gap-5 text-slate-100 h-full min-h-[480px] shadow-2xl relative overflow-hidden"
    >
      
      {/* Dynamic Ambient Background Blur (Signature effect) */}
      <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
        <motion.div
          animate={{
            scale: isPlaying ? [1.1, 1.2, 1.1] : 1.1,
            rotate: isPlaying ? [0, 90, 180, 270, 360] : 0,
          }}
          transition={{
            duration: 35,
            repeat: Infinity,
            ease: "linear",
          }}
          className={`absolute inset-0 bg-gradient-to-tr ${getThemeGradient(theme, currentSong.title)} rounded-full blur-[110px]`}
        />
      </div>

      {isDraggingFile && (
        <div 
          className="absolute inset-0 bg-zinc-950/95 border-2 border-dashed border-zinc-700 m-2 rounded-2xl flex flex-col items-center justify-center gap-3 z-30 pointer-events-none"
        >
          <div className={`p-4 rounded-full ${activeStyles.bg} text-white animate-bounce`}>
            <Layers className="w-8 h-8" />
          </div>
          <p className="font-bold text-slate-100 text-sm">Drop your Lyric file here</p>
          <p className="text-xs text-zinc-500">Supports .lrc, .srt, or plain .txt files</p>
        </div>
      )}

      {/* Header Display */}
      <div className="flex items-center justify-between z-10 border-b border-zinc-900 pb-3">
        <div>
          <span className={`text-[10px] uppercase font-bold tracking-widest ${activeStyles.text}`}>Lyrics Mode</span>
          <h3 className="font-bold text-base text-slate-100 flex items-center gap-1.5 mt-0.5">
            <Layers className={`w-4 h-4 ${activeStyles.text}`} />
            .proximity+ Synced Lyrics
          </h3>
        </div>

        {/* Dynamic Song Title Tag with Unobtrusive Translation Select */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-200 truncate max-w-[110px] sm:max-w-[160px] md:max-w-[220px]">
              {currentSong.title}
            </p>
            <p className="text-[10px] text-zinc-400 truncate max-w-[110px] sm:max-w-[160px] md:max-w-[220px] mt-0.5">
              {currentSong.artist}
            </p>
          </div>
          {hasSyncedLyrics && (
            <div className="relative shrink-0 z-20">
              <select
                id="translate-lyrics-select"
                value={translationLang}
                onChange={(e) => handleTranslate(e.target.value)}
                disabled={translating}
                className="bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-slate-200 text-[10px] font-semibold rounded-lg px-2 py-1 outline-none border border-zinc-800 transition cursor-pointer pr-1"
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
      </div>

      {/* Main Screen Content */}
      <div className="flex-1 flex flex-col justify-between z-10 min-h-0">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-2 border-zinc-900 rounded-full" />
              <div className={`absolute inset-0 border-2 ${activeStyles.border} border-t-transparent rounded-full animate-spin`} />
            </div>
            <p className={`text-xs font-semibold ${activeStyles.text} animate-pulse uppercase tracking-wider`}>{loadingMsg}</p>
            <p className="text-[10px] text-zinc-500 font-mono">Fetching official lyric timetable...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            
            {/* Standard scrolling Synced Lyrics (Karaoke Display) */}
            {!isEditing && hasSyncedLyrics && (
              <div
                ref={scrollContainerRef}
                className="flex-1 max-h-[350px] overflow-y-auto px-4 py-16 flex flex-col gap-8 items-center select-none scrollbar-none scroll-smooth"
              >
                {displayLyrics.map((line, idx) => {
                  const isActive = idx === activeLineIndex;
                  return (
                    <button
                      key={idx}
                      id={`lyric-line-${idx}`}
                      onClick={() => seek(line.time + 0.05)}
                      className={`text-center py-1 px-3 rounded-2xl transition-all duration-300 max-w-full text-lg md:text-xl font-bold tracking-tight focus:outline-none cursor-pointer ${
                        isActive
                          ? `text-slate-100 scale-108 md:scale-112 bg-white/5 border border-white/10 drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]`
                          : "text-zinc-600 hover:text-zinc-300 scale-95 opacity-50"
                      }`}
                    >
                      {line.text}
                    </button>
                  );
                })}
              </div>
            )}

            {/* If there are no synced lyrics yet */}
            {!isEditing && !hasSyncedLyrics && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-14 px-4 bg-zinc-900/30 border border-zinc-900/50 rounded-2xl">
                <Layers className={`w-8 h-8 ${activeStyles.text} mb-2.5`} />
                <h4 className="font-bold text-slate-200 text-sm">No Synced Lyrics Loaded</h4>
                <p className="text-xs text-zinc-500 mt-1.5 max-w-xs leading-relaxed">
                  Find and synchronize lyrics automatically, or drag and drop an .lrc, .srt, or .txt file directly onto this panel.
                </p>
                <button
                  id="sync-now-btn"
                  onClick={handleLookupLyrics}
                  className={`mt-4 flex items-center justify-center gap-1.5 ${activeStyles.bg} ${activeStyles.hoverBg} text-white font-semibold px-4.5 py-2 text-xs rounded-xl transition duration-200 cursor-pointer shadow-lg uppercase tracking-wider font-mono`}
                >
                  Find Lyrics
                </button>
              </div>
            )}

            {/* Inline Timeline Editor Panel (Discrete) */}
            {isEditing && (
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase">Adjust LRC Timeline</label>
                  <span className={`text-[10px] font-mono ${activeStyles.text}`}>Interactive Editor</span>
                </div>
                <div className="h-64 bg-zinc-950 border border-zinc-900 rounded-2xl p-2.5 overflow-y-auto flex flex-col gap-1.5">
                  {editedSyncedLines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-zinc-900/40 border border-zinc-900 p-1.5 rounded-xl">
                      <input
                        type="number"
                        step="0.1"
                        value={line.time}
                        onChange={(e) => handleSyncedLineChange(idx, "time", parseFloat(e.target.value) || 0)}
                        className={`w-14 bg-zinc-950 border border-zinc-900 rounded px-2 py-0.5 text-[10px] font-mono text-center ${activeStyles.text} outline-none`}
                      />
                      <input
                        type="text"
                        value={line.text}
                        onChange={(e) => handleSyncedLineChange(idx, "text", e.target.value)}
                        className="flex-1 bg-transparent text-[11px] text-slate-200 outline-none"
                      />
                    </div>
                  ))}
                  {editedSyncedLines.length === 0 && (
                    <p className="text-[10px] text-zinc-600 text-center py-10 font-mono">No timing lines exist. Sync lyrics first.</p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
                  <button
                    id="cancel-lrc-edits"
                    onClick={() => {
                      setEditedSyncedLines(currentSong.syncedLyrics || []);
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 text-xs bg-zinc-900 hover:bg-zinc-850 text-zinc-400 rounded-lg transition cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    id="save-lrc-edits"
                    onClick={handleSaveEdits}
                    className={`flex items-center gap-1 px-4.5 py-1.5 text-xs ${activeStyles.bg} ${activeStyles.hoverBg} text-white rounded-lg font-semibold transition cursor-pointer shadow-md`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Timing
                  </button>
                </div>
              </div>
            )}

            {/* Quick Lookup Toolbar & Sync Adjust trigger */}
            {!isEditing && (
              <div className="mt-4 pt-3.5 border-t border-zinc-900/80 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
                <div className="flex items-center bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-900 w-full sm:flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0 mr-2" />
                  <input
                    id="search-instructions-input"
                    type="text"
                    placeholder="Search queries / translation (e.g. 'English translation')"
                    value={searchPrompt}
                    onChange={(e) => setSearchPrompt(e.target.value)}
                    className="bg-transparent text-xs text-slate-300 outline-none w-full placeholder-zinc-600"
                  />
                </div>
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    id="trigger-ai-lookup"
                    onClick={handleLookupLyrics}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 ${activeStyles.bg} ${activeStyles.hoverBg} text-white font-semibold px-4 py-2 text-xs rounded-xl transition cursor-pointer min-h-[38px]`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync Lyrics
                  </button>
                  
                  {hasSyncedLyrics && (
                    <button
                      id="toggle-edit-mode"
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-slate-200 border border-zinc-850 rounded-xl text-xs transition cursor-pointer min-h-[38px]"
                      title="Fine tune lyric timing"
                    >
                      Fine-Tune
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
export default LyricsViewer;
