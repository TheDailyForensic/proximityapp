import React, { useState } from "react";
import { useAudio } from "../context/AudioContext";
import { themeStyles } from "../lib/theme";
import { FolderHeart, Plus, Trash2, ListMusic, Music, ChevronRight } from "lucide-react";

export const PlaylistManager: React.FC = () => {
  const {
    playlists,
    activePlaylistId,
    setActivePlaylistId,
    createPlaylist,
    deletePlaylist,
    addSongToPlaylist,
    songs,
    theme,
  } = useAudio();

  const [playlistName, setPlaylistName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const activeStyles = themeStyles[theme] || themeStyles.red;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    await createPlaylist(playlistName.trim());
    setPlaylistName("");
    setIsCreating(false);
  };

  return (
    <div id="playlist-manager-container" className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-5 flex flex-col gap-4 text-slate-200 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderHeart className={`w-5 h-5 ${activeStyles.text}`} />
          <h3 className="font-bold text-slate-100 text-sm md:text-base">Playlists</h3>
        </div>
        <button
          id="playlist-create-toggle"
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-1 text-xs bg-zinc-800 text-slate-200 hover:text-white border border-zinc-700/40 rounded-xl px-3 py-1.5 transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="bg-zinc-950 border border-zinc-900 rounded-2xl p-3 flex flex-col gap-2">
          <label className="text-xs font-semibold text-zinc-500">Playlist Name</label>
          <div className="flex gap-2">
            <input
              id="playlist-name-input"
              type="text"
              placeholder="Vibe playlist..."
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-zinc-700 placeholder-zinc-600"
            />
            <button
              id="playlist-submit"
              type="submit"
              className={`bg-red-600 hover:bg-red-500 text-white px-3.5 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer ${activeStyles.bg} ${activeStyles.hoverBg}`}
            >
              Create
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
        {/* All Songs View Trigger */}
        <button
          id="playlist-select-all"
          onClick={() => setActivePlaylistId(null)}
          className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between group cursor-pointer min-h-[44px] ${
            activePlaylistId === null
              ? `${activeStyles.pulseBg} ${activeStyles.pulseBorder} ${activeStyles.text} font-bold`
              : "bg-zinc-950/30 border-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ListMusic className="w-4 h-4 shrink-0" />
            <div className="overflow-hidden">
              <span className="text-xs font-semibold block">All Uploaded Songs</span>
              <span className="text-[10px] text-zinc-500 block font-mono">{songs.length} tracks</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition text-zinc-400" />
        </button>

        {playlists.map((playlist) => {
          const isActive = activePlaylistId === playlist.id;
          return (
            <div
              key={playlist.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                e.currentTarget.classList.add("border-zinc-500", "bg-zinc-900/85");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("border-zinc-500", "bg-zinc-900/85");
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-zinc-500", "bg-zinc-900/85");
                try {
                  const dataStr = e.dataTransfer.getData("application/json");
                  if (dataStr) {
                    const songIds = JSON.parse(dataStr);
                    if (Array.isArray(songIds)) {
                      for (const songId of songIds) {
                        await addSongToPlaylist(songId, playlist.id);
                      }
                    }
                  }
                } catch (err) {
                  console.error("Playlist drop failed:", err);
                }
              }}
              className={`w-full p-2 pl-3 rounded-xl border transition flex items-center justify-between group ${
                isActive
                  ? `${activeStyles.pulseBg} ${activeStyles.pulseBorder} ${activeStyles.text} font-bold`
                  : "bg-zinc-950/30 border-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-800"
              }`}
            >
              <button
                id={`playlist-select-${playlist.id}`}
                onClick={() => setActivePlaylistId(playlist.id)}
                className="flex-1 text-left flex items-center gap-2.5 cursor-pointer min-h-[44px]"
              >
                <Music className="w-4 h-4 shrink-0" />
                <div className="overflow-hidden">
                  <span className="text-xs font-semibold block truncate">{playlist.name}</span>
                  <span className="text-[10px] text-zinc-500 block font-mono">{playlist.songIds.length} tracks</span>
                </div>
              </button>
              <button
                id={`playlist-delete-${playlist.id}`}
                onClick={() => deletePlaylist(playlist.id)}
                className="p-2 text-zinc-500 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition cursor-pointer min-h-[36px]"
                title="Delete Playlist"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {playlists.length === 0 && (
          <p className="text-[10px] font-mono text-zinc-600 text-center py-2">No playlists created yet</p>
        )}
      </div>
    </div>
  );
};
export default PlaylistManager;
