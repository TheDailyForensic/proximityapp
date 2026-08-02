import React, { useState, useRef, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import audioDb, { Song, Playlist } from "../lib/db";
import { themeStyles, getThemeGradient } from "../lib/theme";
import { 
  Upload, 
  Music, 
  Plus, 
  Check, 
  Play, 
  Trash2, 
  Search, 
  ListMusic, 
  AlertCircle, 
  Database, 
  Save, 
  CheckSquare, 
  Square, 
  FolderPlus, 
  FolderOpen 
} from "lucide-react";

interface StagedFile {
  file: File;
  title: string;
  artist: string;
  album: string;
  albumCover: string;
  duration: number;
  isIdentifying: boolean;
  editedFields?: {
    title?: boolean;
    artist?: boolean;
    album?: boolean;
    albumCover?: boolean;
  };
  targetPlaylistName?: string;
}

// Recursive directory entry parser for folder drag & drop
const traverseFileTree = async (entry: any): Promise<File[]> => {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (file: File) => resolve([file]),
        () => resolve([])
      );
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const allFiles: File[] = [];
      
      const readEntries = () => {
        dirReader.readEntries(
          async (entries: any[]) => {
            if (entries.length === 0) {
              resolve(allFiles);
            } else {
              const promises = entries.map((e) => traverseFileTree(e));
              const results = await Promise.all(promises);
              for (const files of results) {
                allFiles.push(...files);
              }
              // Keep reading entries until empty (handles paging on large directories)
              readEntries();
            }
          },
          () => resolve(allFiles)
        );
      };
      readEntries();
    } else {
      resolve([]);
    }
  });
};

export const SongUploader: React.FC = () => {
  const { 
    songs, 
    playlists, 
    playSong, 
    deleteSong, 
    addSongToPlaylist, 
    removeSongFromPlaylist, 
    activePlaylistId,
    theme,
    loadSongs,
    loadPlaylists,
    playNext,
    playAfter,
    addToQueue
  } = useAudio();

  // Right-click context menu state: { x, y, song }
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);
  
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk target playlist assignment states
  const [bulkPlaylistOption, setBulkPlaylistOption] = useState<string>("none"); // "none", "existing", "new"
  const [bulkSelectedPlaylistId, setBulkSelectedPlaylistId] = useState<string>("");
  const [bulkNewPlaylistName, setBulkNewPlaylistName] = useState<string>("");

  // Multi-selection states
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const activeStyles = themeStyles[theme] || themeStyles.red;
  const reGuessTimeoutRef = useRef<any>(null);

  // Parse Title and Artist from filename as a fallback
  const parseFilename = (filename: string): { title: string; artist: string; album: string } => {
    const cleanName = filename.replace(/\.[^/.]+$/, ""); // Strip extension
    
    if (cleanName.includes(" - ")) {
      const parts = cleanName.split(" - ");
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(" - ").trim(),
        album: "Unknown Album"
      };
    }
    
    if (cleanName.includes("-")) {
      const parts = cleanName.split("-");
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join("-").trim(),
        album: "Unknown Album"
      };
    }

    return {
      artist: "Unknown Artist",
      title: cleanName.trim(),
      album: "Unknown Album"
    };
  };

  // Call the server-side API to identify title, artist, album, and album cover from messy filename
  const identifyMetadata = async (filename: string): Promise<{ title: string; artist: string; album: string; albumCover: string }> => {
    try {
      const res = await fetch("/api/songs/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title || filename.replace(/\.[^/.]+$/, ""),
          artist: data.artist || "Unknown Artist",
          album: data.album || "Unknown Album",
          albumCover: data.albumCover || "",
        };
      }
    } catch (e) {
      console.error("Song metadata identification error:", e);
    }
    const fallback = parseFilename(filename);
    return {
      title: fallback.title,
      artist: fallback.artist,
      album: fallback.album,
      albumCover: "",
    };
  };

  const processFile = async (file: File): Promise<StagedFile> => {
    // We never read embedded ID3 metadata for artist/album cover - it's unreliable for
    // these files (many are music videos saved as long-filename mp3s with garbage or
    // missing tags). Instead we always fall back to filename parsing, then let the
    // background AI/iTunes identify step below figure out the real title/artist/cover.
    const localDetails = parseFilename(file.name);
    
    // Get duration of the song locally
    const getDuration = (): Promise<number> => {
      return new Promise((resolve) => {
        const tempAudio = new Audio();
        const objectUrl = URL.createObjectURL(file);
        tempAudio.src = objectUrl;
        
        tempAudio.addEventListener("loadedmetadata", () => {
          resolve(tempAudio.duration || 0);
          URL.revokeObjectURL(objectUrl);
        });

        tempAudio.addEventListener("error", () => {
          resolve(0);
          URL.revokeObjectURL(objectUrl);
        });
      });
    };

    const duration = await getDuration();

    return {
      file,
      title: localDetails.title,
      artist: localDetails.artist,
      album: localDetails.album,
      albumCover: "",
      duration,
      // Always identify via the AI/iTunes filename pipeline - never trust local metadata
      isIdentifying: true,
      editedFields: {},
    };
  };

  const handleFilesList = async (files: File[], folderName?: string) => {
    const mp3Files = files.filter(
      (file) => file.type === "audio/mpeg" || file.name.endsWith(".mp3")
    );

    if (mp3Files.length === 0) return;

    setIsUploading(true);
    setUploadProgressMsg(folderName ? `Analyzing audio files in "${folderName}"...` : "Analyzing audio files...");

    // 1. Stage locally first to get metadata and duration
    const initialStaged = await Promise.all(
      mp3Files.map(async (f) => {
        const st = await processFile(f);
        if (folderName) {
          st.targetPlaylistName = folderName;
        }
        return st;
      })
    );

    setStagedFiles((prev) => [...prev, ...initialStaged]);
    setIsUploading(false);

    // 2. Perform official song metadata matching/fetching in background for each staged file
    for (let i = 0; i < initialStaged.length; i++) {
      const current = initialStaged[i];
      const filename = current.file.name;
      
      const meta = await identifyMetadata(filename);

      setStagedFiles((prev) => {
        return prev.map((st) => {
          if (st.file === current.file) {
            return {
              ...st,
              title: meta.title,
              artist: meta.artist,
              album: meta.album,
              albumCover: meta.albumCover,
              isIdentifying: false,
            };
          }
          return st;
        });
      });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    handleFilesList(Array.from(files));
  };

  // Folder drag and drop handler
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const items = e.dataTransfer.items;
    if (!items) {
      if (e.dataTransfer.files) {
        await handleFilesList(Array.from(e.dataTransfer.files));
      }
      return;
    }

    const folderPromises: Promise<{ folderName: string; files: File[] }>[] = [];
    const looseFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
        if (entry) {
          if (entry.isDirectory) {
            const traversePromise = (async () => {
              const traversed = await traverseFileTree(entry);
              const mp3s = traversed.filter(
                (file) => file.type === "audio/mpeg" || file.name.endsWith(".mp3")
              );
              return { folderName: entry.name, files: mp3s };
            })();
            folderPromises.push(traversePromise);
          } else {
            const file = item.getAsFile();
            if (file && (file.type === "audio/mpeg" || file.name.endsWith(".mp3"))) {
              looseFiles.push(file);
            }
          }
        } else {
          const file = item.getAsFile();
          if (file && (file.type === "audio/mpeg" || file.name.endsWith(".mp3"))) {
            looseFiles.push(file);
          }
        }
      }
    }

    const folders = await Promise.all(folderPromises);
    const foldersWithMp3s = folders.filter((f) => f.files.length > 0);

    if (foldersWithMp3s.length > 0 || looseFiles.length > 0) {
      if (looseFiles.length > 0) {
        await handleFilesList(looseFiles);
      }

      for (const folder of foldersWithMp3s) {
        await handleFilesList(folder.files, folder.folderName);
      }
    }
  };

  // Debounced iTunes metadata re-guessing for remaining unedited fields
  const triggerReGuess = (index: number, currentStaged: StagedFile[]) => {
    if (reGuessTimeoutRef.current) {
      clearTimeout(reGuessTimeoutRef.current);
    }

    reGuessTimeoutRef.current = setTimeout(async () => {
      const target = currentStaged[index];
      if (!target) return;

      const queryTitle = target.title.trim();
      const queryArtist = target.artist === "Unknown Artist" ? "" : target.artist.trim();

      if (!queryTitle) return;

      console.log(`[Re-guess] Automatic metadata match triggered: "${queryTitle}" by "${queryArtist}"`);
      try {
        const query = queryArtist ? `${queryArtist} ${queryTitle}` : queryTitle;
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
        const res = await fetch(searchUrl);
        if (res.ok) {
          const searchData = await res.json();
          if (searchData && searchData.results && searchData.results.length > 0) {
            const item = searchData.results[0];
            
            setStagedFiles((prev) => {
              const latest = [...prev];
              const fileToUpdate = latest[index];
              if (!fileToUpdate || fileToUpdate.file !== target.file) return prev;

              const edited = fileToUpdate.editedFields || {};

              return latest.map((st, idx) => {
                if (idx === index) {
                  return {
                    ...st,
                    title: edited.title ? st.title : (item.trackName || st.title),
                    artist: edited.artist ? st.artist : (item.artistName || st.artist),
                    album: edited.album ? st.album : (item.collectionName || st.album),
                    albumCover: edited.albumCover ? st.albumCover : (item.artworkUrl100 ? item.artworkUrl100.replace("100x100bb", "600x600bb") : st.albumCover),
                  };
                }
                return st;
              });
            });
          }
        }
      } catch (e) {
        console.warn("[Re-guess] iTunes search lookup failed:", e);
      }
    }, 800);
  };

  const handleInputChange = (index: number, field: "title" | "artist" | "album" | "albumCover", value: string) => {
    setStagedFiles((prev) => {
      const updated = [...prev];
      const current = updated[index];
      const edited = current.editedFields || {};

      updated[index] = {
        ...current,
        [field]: value,
        editedFields: {
          ...edited,
          [field]: true,
        },
      };

      // Trigger re-guess search on title or artist adjustments
      if (field === "title" || field === "artist") {
        triggerReGuess(index, updated);
      }

      return updated;
    });
  };

  // Save single song to database and fetch synced lyrics simultaneously
  const saveStagedSong = async (index: number) => {
    const staged = stagedFiles[index];
    if (!staged) return;
    
    setIsUploading(true);
    setUploadProgressMsg(`Searching lyrics database for "${staged.title || staged.file.name}"...`);

    let finalLyrics = "";
    let finalSynced: any[] = [];
    let finalTitle = (staged.title || "").trim();
    let finalArtist = (staged.artist || "Unknown Artist").trim();
    let finalAlbum = (staged.album || "Unknown Album").trim();
    let finalAlbumCover = staged.albumCover || "";

    try {
      const res = await fetch("/api/lyrics/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: staged.title || staged.file.name.replace(/\.[^/.]+$/, ""),
          artist: staged.artist === "Unknown Artist" ? "" : staged.artist,
          duration: staged.duration,
          originalFilename: staged.file.name,
        }),
      });

      if (res.ok) {
        const lyricData = await res.json();
        finalLyrics = lyricData.lyrics || "";
        finalSynced = (lyricData.syncedLyrics || []).map((l: any) => ({
          time: parseFloat(l.time) || 0,
          text: String(l.text || ""),
        })).sort((a: any, b: any) => a.time - b.time);

        // Only backfill if staged metadata is empty or matches raw filename
        if (!finalTitle || finalTitle === staged.file.name.replace(/\.[^/.]+$/, "")) {
          if (lyricData.title && lyricData.title.trim()) {
            finalTitle = lyricData.title.trim();
          }
        }
        if (!finalArtist || finalArtist === "Unknown Artist") {
          if (lyricData.artist && lyricData.artist.trim()) {
            finalArtist = lyricData.artist.trim();
          }
        }
      }
    } catch (e) {
      console.warn("Auto-lyric search failed during upload:", e);
    }

    // Clean title and ensure extension is stripped
    if (!finalTitle) {
      finalTitle = staged.file.name.replace(/\.[^/.]+$/, "");
    } else {
      finalTitle = finalTitle.replace(/\.[^/.]+$/, "");
    }

    const newSong: Song = {
      id: "song_" + Math.random().toString(36).substr(2, 9),
      title: finalTitle,
      artist: finalArtist,
      album: finalAlbum,
      albumCover: finalAlbumCover,
      duration: staged.duration,
      lyrics: finalLyrics,
      syncedLyrics: finalSynced,
      audioBlob: staged.file,
      createdAt: Date.now(),
    };

    await audioDb.saveSong(newSong);

    // Resolve bulk target playlist or fall back to folder name
    let targetPlaylistId = "";
    if (bulkPlaylistOption === "existing" && bulkSelectedPlaylistId) {
      targetPlaylistId = bulkSelectedPlaylistId;
    } else if (bulkPlaylistOption === "new" && bulkNewPlaylistName.trim()) {
      const playlistName = bulkNewPlaylistName.trim();
      let targetPl = playlists.find((p) => p.name.toLowerCase() === playlistName.toLowerCase());
      if (targetPl) {
        targetPlaylistId = targetPl.id;
      } else {
        targetPlaylistId = "pl_" + Math.random().toString(36).substr(2, 9);
        const newPl: Playlist = {
          id: targetPlaylistId,
          name: playlistName,
          songIds: [],
          createdAt: Date.now(),
        };
        await audioDb.savePlaylist(newPl);
        await loadPlaylists();
      }
    }

    if (targetPlaylistId) {
      await addSongToPlaylist(newSong.id, targetPlaylistId);
    } else if (staged.targetPlaylistName) {
      const playlistName = staged.targetPlaylistName.trim();
      let targetPl = playlists.find((p) => p.name.toLowerCase() === playlistName.toLowerCase());
      let targetPlId = targetPl?.id;

      if (!targetPl) {
        targetPlId = "pl_" + Math.random().toString(36).substr(2, 9);
        const newPl: Playlist = {
          id: targetPlId,
          name: playlistName,
          songIds: [],
          createdAt: Date.now(),
        };
        await audioDb.savePlaylist(newPl);
        await loadPlaylists();
      }

      if (targetPlId) {
        await addSongToPlaylist(newSong.id, targetPlId);
      }
    }
    
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
    setIsUploading(false);
    await loadSongs();
    await loadPlaylists();
  };

  // Save all staged songs sequentially
  const saveAllStagedSongs = async () => {
    if (stagedFiles.length === 0) return;
    setIsUploading(true);
    
    // Resolve bulk target playlist if specified
    let targetPlaylistId = "";
    if (bulkPlaylistOption === "existing" && bulkSelectedPlaylistId) {
      targetPlaylistId = bulkSelectedPlaylistId;
    } else if (bulkPlaylistOption === "new" && bulkNewPlaylistName.trim()) {
      const playlistName = bulkNewPlaylistName.trim();
      let targetPl = playlists.find((p) => p.name.toLowerCase() === playlistName.toLowerCase());
      if (targetPl) {
        targetPlaylistId = targetPl.id;
      } else {
        targetPlaylistId = "pl_" + Math.random().toString(36).substr(2, 9);
        const newPl: Playlist = {
          id: targetPlaylistId,
          name: playlistName,
          songIds: [],
          createdAt: Date.now(),
        };
        await audioDb.savePlaylist(newPl);
        await loadPlaylists();
      }
    }

    const toProcess = [...stagedFiles];
    
    for (let i = 0; i < toProcess.length; i++) {
      const staged = toProcess[i];
      setUploadProgressMsg(`Matching lyrics & importing: "${staged.title || staged.file.name}" (${i + 1}/${toProcess.length})...`);
      
      let finalLyrics = "";
      let finalSynced: any[] = [];
      let finalTitle = (staged.title || "").trim();
      let finalArtist = (staged.artist || "Unknown Artist").trim();
      let finalAlbum = (staged.album || "Unknown Album").trim();
      let finalAlbumCover = staged.albumCover || "";

      try {
        const res = await fetch("/api/lyrics/find", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: staged.title || staged.file.name.replace(/\.[^/.]+$/, ""),
            artist: staged.artist === "Unknown Artist" ? "" : staged.artist,
            duration: staged.duration,
            originalFilename: staged.file.name,
          }),
        });

        if (res.ok) {
          const lyricData = await res.json();
          finalLyrics = lyricData.lyrics || "";
          finalSynced = (lyricData.syncedLyrics || []).map((l: any) => ({
            time: parseFloat(l.time) || 0,
            text: String(l.text || ""),
          })).sort((a: any, b: any) => a.time - b.time);

          // Only backfill if staged metadata is empty or matches raw filename
          if (!finalTitle || finalTitle === staged.file.name.replace(/\.[^/.]+$/, "")) {
            if (lyricData.title && lyricData.title.trim()) {
              finalTitle = lyricData.title.trim();
            }
          }
          if (!finalArtist || finalArtist === "Unknown Artist") {
            if (lyricData.artist && lyricData.artist.trim()) {
              finalArtist = lyricData.artist.trim();
            }
          }
        }
      } catch (e) {
        console.warn("Auto-lyric search failed during bulk upload:", e);
      }

      // Clean title and ensure extension is stripped
      if (!finalTitle) {
        finalTitle = staged.file.name.replace(/\.[^/.]+$/, "");
      } else {
        finalTitle = finalTitle.replace(/\.[^/.]+$/, "");
      }

      const newSong: Song = {
        id: "song_" + Math.random().toString(36).substr(2, 9),
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        albumCover: finalAlbumCover,
        duration: staged.duration,
        lyrics: finalLyrics,
        syncedLyrics: finalSynced,
        audioBlob: staged.file,
        createdAt: Date.now(),
      };

      await audioDb.saveSong(newSong);

      // Add to resolved bulk target playlist if specified, or folder fallback
      if (targetPlaylistId) {
        await addSongToPlaylist(newSong.id, targetPlaylistId);
      } else if (staged.targetPlaylistName) {
        const playlistName = staged.targetPlaylistName.trim();
        let targetPl = playlists.find((p) => p.name.toLowerCase() === playlistName.toLowerCase());
        let targetPlId = targetPl?.id;

        if (!targetPl) {
          targetPlId = "pl_" + Math.random().toString(36).substr(2, 9);
          const newPl: Playlist = {
            id: targetPlId,
            name: playlistName,
            songIds: [],
            createdAt: Date.now(),
          };
          await audioDb.savePlaylist(newPl);
          await loadPlaylists();
        }

        if (targetPlId) {
          await addSongToPlaylist(newSong.id, targetPlId);
        }
      }
    }

    setStagedFiles([]);
    setIsUploading(false);
    await loadSongs();
    await loadPlaylists();
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const filteredSongs = songs.filter((song) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      song.title.toLowerCase().includes(searchLower) ||
      song.artist.toLowerCase().includes(searchLower) ||
      (song.album && song.album.toLowerCase().includes(searchLower))
    );
  });

  // Helper to determine if clicked element is an interactive child
  const isInteractiveElement = (target: HTMLElement): boolean => {
    const tag = target.tagName.toLowerCase();
    if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea" || tag === "a") {
      return true;
    }
    let parent = target.parentElement;
    while (parent && parent !== containerRef.current) {
      const parentTag = parent.tagName.toLowerCase();
      if (parentTag === "button" || parentTag === "input" || parentTag === "select" || parentTag === "textarea" || parentTag === "a") {
        return true;
      }
      if (parent.classList.contains("cursor-pointer") || parent.getAttribute("role") === "button") {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click only
    const target = e.target as HTMLElement;
    if (isInteractiveElement(target)) return;

    // Prevent default text highlight selection
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragEnd({ x: e.clientX, y: e.clientY });

    // Clear selection unless Ctrl/Cmd key is pressed
    if (!e.ctrlKey && !e.metaKey) {
      setSelectedSongIds(new Set());
    }
  };

  // Marquee selection overlay tracking
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      setDragEnd({ x: e.clientX, y: e.clientY });

      const x1 = Math.min(dragStart.x, e.clientX);
      const x2 = Math.max(dragStart.x, e.clientX);
      const y1 = Math.min(dragStart.y, e.clientY);
      const y2 = Math.max(dragStart.y, e.clientY);

      const items = containerRef.current?.querySelectorAll(".song-list-item");
      if (!items) return;

      const newSelected = new Set<string>();
      items.forEach((el) => {
        const id = el.getAttribute("data-song-id");
        if (id) {
          const r = el.getBoundingClientRect();
          // 2D intersection calculations
          const intersects = !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
          if (intersects) {
            newSelected.add(id);
          }
        }
      });

      setSelectedSongIds((prev) => {
        const result = new Set(prev);
        newSelected.forEach(id => result.add(id));
        return result;
      });
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging, dragStart]);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      if (reGuessTimeoutRef.current) {
        clearTimeout(reGuessTimeoutRef.current);
      }
    };
  }, []);

  const containerRect = containerRef.current?.getBoundingClientRect();
  const marqueeLeft = containerRect ? Math.min(dragStart.x, dragEnd.x) - containerRect.left : 0;
  const marqueeTop = containerRect ? Math.min(dragStart.y, dragEnd.y) - containerRect.top : 0;
  const marqueeWidth = Math.abs(dragStart.x - dragEnd.x);
  const marqueeHeight = Math.abs(dragStart.y - dragEnd.y);

  return (
    <div id="songs-manager-container" className="flex flex-col gap-6 text-slate-200">
      
      {/* Upload Zone (Supports both files & folder drops) */}
      <div
        id="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed ${
          isDraggingOver 
            ? `${activeStyles.border} bg-zinc-900/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]` 
            : "border-zinc-800 hover:border-zinc-700 bg-zinc-950 hover:bg-zinc-900/40"
        } rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all duration-200 group relative`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mp3, audio/mpeg"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <div className={`p-3 bg-zinc-900 border border-zinc-800 rounded-full group-hover:scale-105 transition-transform duration-300`}>
          <Upload className={`w-5 h-5 ${activeStyles.text}`} />
        </div>
        <div>
          <p className="font-semibold text-slate-100 text-sm md:text-base">
            Drag & drop music files or folders here
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            We recursively convert folders into individual playlists automatically (MP3 only)
          </p>
        </div>
      </div>

      {/* Global Action / Loading Indicator */}
      {isUploading && (
        <div id="upload-hud" className={`flex items-center gap-3 ${activeStyles.pulseBg} border ${activeStyles.pulseBorder} ${activeStyles.pulseText} p-3.5 rounded-xl text-xs font-medium animate-pulse`}>
          <div className={`w-4 h-4 border-2 ${activeStyles.border} border-t-transparent rounded-full animate-spin shrink-0`} />
          <span>{uploadProgressMsg}</span>
        </div>
      )}

      {/* Staging Drawer */}
      {stagedFiles.length > 0 && (
        <div id="staging-drawer" className="bg-zinc-900/50 border border-zinc-850 rounded-2xl p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h4 className={`text-sm font-semibold ${activeStyles.text} flex items-center gap-1.5`}>
              <Database className={`w-4 h-4 ${activeStyles.text}`} />
              Metadata Processing ({stagedFiles.length} pending)
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={saveAllStagedSongs}
                disabled={isUploading}
                className={`flex items-center gap-1.5 ${activeStyles.bg} ${activeStyles.hoverBg} text-white font-semibold px-3 py-1.5 text-xs rounded-lg transition duration-200 cursor-pointer disabled:opacity-50`}
              >
                <Save className="w-3.5 h-3.5" />
                Save All Tracks
              </button>
              <span className={`text-[9px] ${activeStyles.badge} border px-2 py-0.5 rounded font-mono font-bold`}>
                MATCH ENGINE ACTIVE
              </span>
            </div>
          </div>

          {/* Bulk playlist target selector */}
          <div id="bulk-playlist-panel" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/40 border border-zinc-850 p-3 rounded-xl text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full">
              <span className="text-zinc-400 font-semibold shrink-0">Add all uploaded songs to playlist:</span>
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <select
                  id="bulk-playlist-select"
                  value={bulkPlaylistOption === "existing" ? bulkSelectedPlaylistId : bulkPlaylistOption}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "none") {
                      setBulkPlaylistOption("none");
                      setBulkSelectedPlaylistId("");
                    } else if (val === "new") {
                      setBulkPlaylistOption("new");
                      setBulkSelectedPlaylistId("");
                    } else {
                      setBulkPlaylistOption("existing");
                      setBulkSelectedPlaylistId(val);
                    }
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-zinc-700 min-w-[180px] max-w-full cursor-pointer"
                >
                  <option value="none">-- Library Only (No Playlist) --</option>
                  <option value="new">+ Create New Playlist...</option>
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>Add to: {pl.name}</option>
                  ))}
                </select>

                {bulkPlaylistOption === "new" && (
                  <input
                    id="bulk-playlist-new-input"
                    type="text"
                    placeholder="Enter new playlist name..."
                    value={bulkNewPlaylistName}
                    onChange={(e) => setBulkNewPlaylistName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-zinc-700 w-full sm:w-56 placeholder-zinc-600"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
            {stagedFiles.map((staged, index) => (
              <div key={index} className="flex flex-col gap-3 bg-black/40 p-3 rounded-xl border border-zinc-850">
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                  <div className="flex items-center gap-2.5 w-full md:w-1/3">
                    {staged.albumCover ? (
                      <img 
                        src={staged.albumCover} 
                        alt="Preview" 
                        className="w-10 h-10 object-cover rounded-lg border border-zinc-800" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white uppercase shrink-0 bg-gradient-to-br ${getThemeGradient(theme, staged.title)}`}>
                        {staged.title ? staged.title.slice(0, 2) : "MP3"}
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-slate-200 truncate" title={staged.file.name}>
                        {staged.file.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-mono text-zinc-500">MP3 • {formatDuration(staged.duration)}</span>
                        {staged.targetPlaylistName && (
                          <span className="text-[9px] bg-zinc-800/60 text-zinc-400 px-1.5 py-0.2 rounded border border-zinc-800 font-semibold max-w-[120px] truncate" title={`Auto-Playlist: ${staged.targetPlaylistName}`}>
                            📁 {staged.targetPlaylistName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {staged.isIdentifying ? (
                    <div className="flex-1 flex items-center justify-center gap-2 py-2">
                      <div className={`w-3.5 h-3.5 border-2 ${activeStyles.border} border-t-transparent rounded-full animate-spin`} />
                      <span className="text-[11px] font-mono text-zinc-400 animate-pulse">Extracting track details and collection names...</span>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col sm:flex-row gap-2 items-center justify-end w-full">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                        <div className="flex items-center bg-zinc-950 rounded-lg px-2.5 py-1 border border-zinc-900">
                          <span className="text-[9px] font-bold text-zinc-500 mr-2 shrink-0">TITLE</span>
                          <input
                            type="text"
                            value={staged.title}
                            onChange={(e) => handleInputChange(index, "title", e.target.value)}
                            className="bg-transparent text-xs text-slate-100 outline-none w-full"
                          />
                        </div>
                        <div className="flex items-center bg-zinc-950 rounded-lg px-2.5 py-1 border border-zinc-900">
                          <span className="text-[9px] font-bold text-zinc-500 mr-2 shrink-0">ARTIST</span>
                          <input
                            type="text"
                            value={staged.artist}
                            onChange={(e) => handleInputChange(index, "artist", e.target.value)}
                            className="bg-transparent text-xs text-slate-100 outline-none w-full"
                          />
                        </div>
                        <div className="flex items-center bg-zinc-950 rounded-lg px-2.5 py-1 border border-zinc-900">
                          <span className="text-[9px] font-bold text-zinc-500 mr-2 shrink-0">ALBUM</span>
                          <input
                            type="text"
                            value={staged.album}
                            onChange={(e) => handleInputChange(index, "album", e.target.value)}
                            className="bg-transparent text-xs text-slate-100 outline-none w-full"
                          />
                        </div>
                      </div>

                      <button
                        id={`save-staged-${index}`}
                        onClick={() => saveStagedSong(index)}
                        disabled={isUploading}
                        className={`w-full sm:w-auto flex items-center justify-center gap-1.5 ${activeStyles.bg} ${activeStyles.hoverBg} text-white font-semibold px-4 py-2 text-xs rounded-xl transition duration-200 cursor-pointer shadow-lg disabled:opacity-50 shrink-0`}
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Song List & Library */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-2">
            <ListMusic className={`w-5 h-5 ${activeStyles.text}`} />
            <h3 className="font-semibold text-slate-100 text-sm md:text-base">
              {activePlaylistId ? "Playlist Tracks" : "All Tracks"} ({filteredSongs.length})
            </h3>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-500" />
            <input
              id="library-search"
              type="text"
              placeholder="Search library by song, artist, album..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-zinc-950 border border-zinc-850 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 outline-none focus:border-zinc-700`}
            />
          </div>
        </div>

        {/* Multi-Selection Batch Actions Panel */}
        {selectedSongIds.size > 0 && (
          <div
            id="batch-actions-panel"
            className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 shadow-2xl animate-fade-in z-10"
          >
            <div className="flex items-center gap-2">
              <CheckSquare className={`w-4 h-4 ${activeStyles.text}`} />
              <span className="text-xs font-semibold text-slate-100">
                {selectedSongIds.size} {selectedSongIds.size === 1 ? "track" : "tracks"} selected
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
              <button
                onClick={() => {
                  const songsToPlay = songs.filter((s) => selectedSongIds.has(s.id));
                  if (songsToPlay.length > 0) {
                    playSong(songsToPlay[0], songsToPlay);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition duration-200 cursor-pointer`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Play Selected
              </button>

              {playlists.length > 0 && (
                <div className="relative group/batch-playlist">
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-slate-200 font-semibold text-xs rounded-lg border border-zinc-750 transition cursor-pointer`}
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
                    Add to Playlist
                  </button>
                  <div className="absolute right-0 bottom-full mb-1 w-48 bg-zinc-950 border border-zinc-850 rounded-xl shadow-xl p-1.5 hidden group-hover/batch-playlist:block z-30">
                    <p className="text-[10px] font-semibold text-zinc-500 px-2.5 py-1 uppercase border-b border-zinc-900 mb-1">Select Playlist</p>
                    <div className="max-h-36 overflow-y-auto">
                      {playlists.map((pl) => (
                        <button
                          key={pl.id}
                          onClick={async () => {
                            for (const songId of Array.from(selectedSongIds)) {
                              await addSongToPlaylist(songId, pl.id);
                            }
                            setSelectedSongIds(new Set());
                          }}
                          className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-zinc-900 rounded-lg transition flex items-center justify-between text-zinc-300 hover:text-white"
                        >
                          <span className="truncate">{pl.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  const name = prompt("Enter a name for the new playlist:");
                  if (name && name.trim()) {
                    const playlistId = "pl_" + Math.random().toString(36).substr(2, 9);
                    const newPlaylist: Playlist = {
                      id: playlistId,
                      name: name.trim(),
                      songIds: Array.from(selectedSongIds),
                      createdAt: Date.now(),
                    };
                    await audioDb.savePlaylist(newPlaylist);
                    await loadPlaylists();
                    setSelectedSongIds(new Set());
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-slate-200 font-semibold text-xs rounded-lg border border-zinc-750 transition cursor-pointer`}
              >
                <Plus className="w-3.5 h-3.5 text-zinc-400" />
                New Playlist
              </button>

              <button
                onClick={async () => {
                  if (confirm(`Are you sure you want to delete the ${selectedSongIds.size} selected track(s)?`)) {
                    for (const id of Array.from(selectedSongIds)) {
                      await deleteSong(id);
                    }
                    setSelectedSongIds(new Set());
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 font-semibold text-xs rounded-lg border border-red-500/20 transition cursor-pointer`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>

              <button
                onClick={() => setSelectedSongIds(new Set())}
                className="px-2.5 py-1.5 text-zinc-400 hover:text-white text-xs hover:bg-zinc-850 rounded-lg transition cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Song Library Container */}
        {filteredSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-zinc-900/10 border border-zinc-900 rounded-2xl">
            <Music className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-xs font-semibold text-zinc-400">Library Empty</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Upload songs or drop folders to populate your collection.</p>
          </div>
        ) : (
          <div 
            ref={containerRef}
            onMouseDown={handleMouseDown}
            className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto scrollbar-thin pr-1 relative select-none"
          >
            {/* Visual Marquee Drag Box */}
            {isDragging && (
              <div
                style={{
                  position: "absolute",
                  left: marqueeLeft,
                  top: marqueeTop,
                  width: marqueeWidth,
                  height: marqueeHeight,
                  pointerEvents: "none",
                  zIndex: 40,
                }}
                className={`border-2 ${activeStyles.border} bg-zinc-100/5 backdrop-blur-[0.5px] rounded-lg shadow-2xl transition-[opacity] duration-150`}
              />
            )}

            {filteredSongs.map((song) => {
              const hasLrc = song.syncedLyrics && song.syncedLyrics.length > 0;
              const isSelected = selectedSongIds.has(song.id);
              return (
                <div
                  key={song.id}
                  data-song-id={song.id}
                  draggable={true}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, song });
                  }}
                  onDragStart={(e) => {
                    const selectedArray = Array.from(selectedSongIds);
                    const dragIds = selectedSongIds.has(song.id)
                      ? selectedArray
                      : [song.id];
                    e.dataTransfer.setData("application/json", JSON.stringify(dragIds));
                    e.dataTransfer.effectAllowed = "copyMove";
                  }}
                  className={`song-list-item group flex flex-col sm:flex-row items-center justify-between gap-3 ${
                    isSelected 
                      ? "bg-zinc-900/80 border-zinc-650 shadow-[inset_0_0_8px_rgba(255,255,255,0.03)]" 
                      : "bg-zinc-950 hover:bg-zinc-900 border-zinc-900"
                  } border rounded-xl p-2.5 transition duration-200 cursor-grab active:cursor-grabbing`}
                >
                  <div className="flex items-center gap-3 w-full sm:w-1/2">
                    {/* Actionable Checkbox Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSongIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(song.id)) {
                            next.delete(song.id);
                          } else {
                            next.add(song.id);
                          }
                          return next;
                        });
                      }}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-slate-200 transition shrink-0 cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className={`w-4 h-4 ${activeStyles.text}`} />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-700 hover:text-zinc-500 group-hover:text-zinc-650" />
                      )}
                    </button>

                    <div className="relative w-10 h-10 border border-zinc-850 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                      {song.albumCover ? (
                        <img 
                          src={song.albumCover} 
                          alt={song.title} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-full h-full rounded-lg flex items-center justify-center text-xs font-bold text-white uppercase shrink-0 bg-gradient-to-br ${getThemeGradient(theme, song.title)}`}>
                          {song.title.slice(0, 2)}
                        </div>
                      )}
                      <button
                        id={`play-hover-${song.id}`}
                        onClick={() => playSong(song, filteredSongs)}
                        className={`absolute inset-0 ${activeStyles.bg} text-white flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition duration-150 cursor-pointer shadow-md`}
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </button>
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <h5 className="text-sm font-semibold text-slate-100 truncate">{song.title}</h5>
                        {hasLrc && (
                          <span className={`${activeStyles.badge} border text-[8px] px-1 rounded-full font-mono font-bold shrink-0`}>
                            LRC
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 truncate">
                        {song.artist} • <span className="text-zinc-500 font-normal">{song.album || "Unknown Album"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
                    <span className="text-xs font-mono text-zinc-500 shrink-0">{formatDuration(song.duration)}</span>

                    <div className="flex items-center gap-1">
                      {/* Add to Playlist Selector */}
                      {playlists.length > 0 && (
                        <div className="relative group/menu">
                          <button
                            id={`add-pl-menu-${song.id}`}
                            className="flex items-center gap-1 p-1.5 hover:bg-zinc-850 text-zinc-400 hover:text-slate-200 rounded-lg border border-transparent text-xs transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Playlist
                          </button>
                          <div className="absolute right-0 bottom-full mb-1 w-44 bg-zinc-950 border border-zinc-850 rounded-xl shadow-xl p-1.5 hidden group-hover/menu:block z-20">
                            <p className="text-[10px] font-semibold text-zinc-500 px-2.5 py-1 uppercase border-b border-zinc-900 mb-1">Add to Playlist</p>
                            <div className="max-h-36 overflow-y-auto">
                              {playlists.map((pl) => {
                                const isAdded = pl.songIds.includes(song.id);
                                return (
                                  <button
                                    id={`pl-toggle-${pl.id}-song-${song.id}`}
                                    key={pl.id}
                                    onClick={async () => {
                                      if (isAdded) {
                                        await removeSongFromPlaylist(song.id, pl.id);
                                      } else {
                                        await addSongToPlaylist(song.id, pl.id);
                                      }
                                    }}
                                    className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-zinc-900 rounded-lg transition flex items-center justify-between text-zinc-300 hover:text-white"
                                  >
                                    <span className="truncate">{pl.name}</span>
                                    {isAdded && <Check className={`w-3.5 h-3.5 ${activeStyles.text}`} />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Delete Song */}
                      <button
                        id={`delete-song-${song.id}`}
                        onClick={() => deleteSong(song.id)}
                        className="p-1.5 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded-lg transition cursor-pointer"
                        title="Delete track"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right-click context menu: Play Next / Add to Queue */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 100,
          }}
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
          <button
            onClick={() => {
              addToQueue(contextMenu.song);
              setContextMenu(null);
            }}
            className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-zinc-900 rounded-lg transition flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add to Queue
          </button>
          <button
            onClick={() => {
              playSong(contextMenu.song, filteredSongs);
              setContextMenu(null);
            }}
            className="w-full text-left text-xs px-2.5 py-1.5 hover:bg-zinc-900 rounded-lg transition flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            Play Now
          </button>
        </div>
      )}
    </div>
  );
};

export default SongUploader;
