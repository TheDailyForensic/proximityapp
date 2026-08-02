import React, { useEffect, useState } from "react";
import { useAudio } from "../context/AudioContext";
import { themeStyles, getThemeGradient } from "../lib/theme";
import { X, ChevronUp, ChevronDown, Trash2, Music, Play, Disc, GripVertical, ListMusic } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface QueueManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueManager: React.FC<QueueManagerProps> = ({ isOpen, onClose }) => {
  const {
    queue,
    queueIndex,
    currentSong,
    theme,
    setQueue,
    playSong,
    playNext,
    playAfter,
  } = useAudio();

  const activeStyles = themeStyles[theme] || themeStyles.red;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: (typeof queue)[number] } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  if (!isOpen) return null;

  // Reorder the queue by dragging a track to a new position
  const reorderQueue = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    setQueue(newQueue);
  };

  // Swap function to reorder songs
  const moveSong = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queue.length) return;

    const newQueue = [...queue];
    const temp = newQueue[index];
    newQueue[index] = newQueue[targetIndex];
    newQueue[targetIndex] = temp;

    setQueue(newQueue);
  };

  // Remove song from queue
  const removeSongFromQueue = (index: number) => {
    if (queue.length <= 1) return; // Don't remove the last song

    const newQueue = queue.filter((_, idx) => idx !== index);
    setQueue(newQueue);
  };

  // Clear all except current
  const clearQueueExceptCurrent = () => {
    if (!currentSong) return;
    setQueue([currentSong]);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm">
        {/* Backdrop click to close */}
        <div className="absolute inset-0 cursor-pointer" onClick={onClose} />

        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative w-full max-w-md h-full bg-zinc-950 border-l border-zinc-900 shadow-2xl flex flex-col z-10 text-slate-100"
        >
          {/* Header */}
          <div className="p-5 border-b border-zinc-900 flex items-center justify-between bg-zinc-900/10">
            <div className="flex items-center gap-2">
              <Disc className={`w-5 h-5 ${activeStyles.text} animate-spin-slow`} />
              <div>
                <h3 className="font-bold text-sm md:text-base">Play Queue</h3>
                <p className="text-[10px] font-mono text-zinc-500 uppercase">{queue.length} tracks loaded</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {queue.length > 1 && (
                <button
                  onClick={clearQueueExceptCurrent}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition px-2.5 py-1 hover:bg-zinc-900 rounded-lg font-medium cursor-pointer"
                >
                  Clear Queue
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Queue List */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 scrollbar-none">
            {queue.map((song, idx) => {
              const isCurrent = currentSong?.id === song.id && queueIndex === idx;
              return (
                <div
                  key={`${song.id}-${idx}`}
                  draggable={true}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, song });
                  }}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverIndex !== idx) setDragOverIndex(idx);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) reorderQueue(dragIndex, idx);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                    dragOverIndex === idx && dragIndex !== null && dragIndex !== idx
                      ? `${activeStyles.border} border-dashed`
                      : isCurrent
                      ? `${activeStyles.pulseBg} ${activeStyles.pulseBorder} border-opacity-40`
                      : "bg-zinc-900/30 border-zinc-900/60 hover:bg-zinc-900/60 hover:border-zinc-850"
                  }`}
                >
                  {/* Left: Artwork / Index and Metadata */}
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <GripVertical className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                    <div className="relative w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-zinc-850">
                      {song.albumCover ? (
                        <img
                          src={song.albumCover}
                          alt={song.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-[10px] font-bold text-white uppercase bg-gradient-to-br ${getThemeGradient(theme, song.title)}`}>
                          {song.title.slice(0, 2)}
                        </div>
                      )}
                      <button
                        onClick={() => playSong(song, queue)}
                        className={`absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition duration-150 cursor-pointer`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </button>
                    </div>

                    <div className="overflow-hidden flex-1">
                      <h4 className={`text-xs font-semibold truncate ${isCurrent ? activeStyles.text : "text-slate-100"}`}>
                        {song.title}
                      </h4>
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                        {song.artist}
                      </p>
                    </div>
                  </div>

                  {/* Right: Order controls and delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Up button */}
                    <button
                      onClick={() => moveSong(idx, "up")}
                      disabled={idx === 0}
                      className="p-1 hover:bg-zinc-900 text-zinc-500 hover:text-slate-300 rounded transition disabled:opacity-20 cursor-pointer"
                      title="Move Up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>

                    {/* Down button */}
                    <button
                      onClick={() => moveSong(idx, "down")}
                      disabled={idx === queue.length - 1}
                      className="p-1 hover:bg-zinc-900 text-zinc-500 hover:text-slate-300 rounded transition disabled:opacity-20 cursor-pointer"
                      title="Move Down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => removeSongFromQueue(idx)}
                      disabled={queue.length <= 1}
                      className="p-1 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded transition disabled:opacity-20 cursor-pointer"
                      title="Remove from Queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Right-click context menu on a queued track: Play Next / Play After */}
        {contextMenu && (
          <div
            style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 100 }}
            onClick={(e) => e.stopPropagation()}
            className="w-48 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-1.5 text-slate-100"
          >
            <p className="text-[10px] font-semibold text-zinc-500 px-2.5 py-1 uppercase border-b border-zinc-900 mb-1 truncate">
              {contextMenu.song.title}
            </p>
            <button
              onClick={() => {
                playNext(contextMenu.song);
                setContextMenu(null);
              }}
              className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-zinc-900 rounded-lg transition flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer"
            >
              <ListMusic className="w-3.5 h-3.5" />
              Play Next
            </button>
            <button
              onClick={() => {
                playAfter(contextMenu.song);
                setContextMenu(null);
              }}
              className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-zinc-900 rounded-lg transition flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer"
            >
              <ListMusic className="w-3.5 h-3.5" />
              Play After
            </button>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};
