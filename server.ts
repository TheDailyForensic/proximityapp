import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
// Load environment variables in development
dotenv.config();

// Helper to make API calls to Groq (can be llama-3.3-70b-versatile, etc.) using native fetch
async function callGroqAPI(prompt: string, jsonMode = false, systemInstruction?: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY; // Fallback to GEMINI_API_KEY if user already had it set up in secrets
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is required but not configured. Please add it in Settings > Secrets (or set it as GROQ_API_KEY / GEMINI_API_KEY).");
  }

  const model = "llama-3.3-70b-versatile";
  
  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API returned status ${response.status}: ${errText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

// Helper to retry asynchronous operations with exponential backoff on 429/rate limits
async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = String(error?.message || error || "").toLowerCase();
    const is429 = error?.status === 429 || error?.code === 429 || errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("resource_exhausted") || errorStr.includes("rate limit") || errorStr.includes("too many requests");
    
    if (is429 && retries > 0) {
      console.warn(`Groq/LLM API rate limited (429/Quota). Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Advanced cleanup specifically for prominent Indian music downloader portals and general web download sites
function cleanDownloaderClutter(filename: string): string {
  let cleaned = filename;
  
  // 1. Strip bracket-enclosed website names or common downloader tags
  cleaned = cleaned.replace(/[([][^\])]*?\b(masstamilan|isaimini|starmusiq|sensongsmp3|pagalworld|songsmp3|mr-jatt|riskyjatt|123musiq|tamilanda|kuttyweb|raaga|saavn|wynk|gaana|filmywap|bolly4u|djpunjab|hungama|bhojpuri|tamilplay|tamiltunes|isaiminisong|isaiminisongs|isaiminis|masstamilan1|starmusiqco|sensongs|starmusiqtop|star-musiq|singamda|kuttywap|isaiminipdf|starmusiq\.co|starmusiq\.net|masstamilan\.co|masstamilan\.co\.in|sensongsmp3\.co|pagalworld\.co|pagalworld\.link)\b[^\])]*?[\])]/gi, "");
  
  // Strip general brackets containing domain patterns to match [something.com], (any.in), etc.
  cleaned = cleaned.replace(/[([][^\])]*?\.(com|net|org|info|in|co|club|us|xyz|me|cc|be|link|dev|vip|live|fm|online|net\.in|co\.in)[^\])]*?[\])]/gi, "");

  // 2. Strip raw website links or domains that are free-floating
  cleaned = cleaned.replace(/\b[\w-]+\.(com|net|org|info|in|co|club|us|xyz|me|cc|be|link|dev|vip|live|fm|online|net\.in|co\.in)\b/gi, "");

  // 3. Strip prominent downloader site name words
  cleaned = cleaned.replace(/\b(masstamilan|isaimini|starmusiq|sensongsmp3|pagalworld|songsmp3|mr-jatt|riskyjatt|123musiq|tamilanda|kuttyweb|raaga|saavn|wynk|gaana|filmywap|bolly4u|djpunjab|hungama|bhojpuri|tamilplay|tamiltunes|isaiminisong|isaiminisongs|starmusiqco|starmusiqtop|star-musiq|singamda|kuttywap|isaiminipdf)\b/gi, "");

  // 4. Clean up any trailing/leading underscores, dashes, or spaces left from the removals
  cleaned = cleaned.replace(/^[\s-_]+|[\s-_]+$/g, "");
  cleaned = cleaned.replace(/[\s-_]{2,}/g, " ");

  return cleaned.trim();
}

// Check string similarity to determine if an iTunes search result is a high-confidence match
function isConfidentMatch(localTitle: string, iTunesTitle: string): boolean {
  const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const t1 = cleanStr(localTitle);
  const t2 = cleanStr(iTunesTitle);
  
  if (!t1 || !t2) return false;
  if (t1.includes(t2) || t2.includes(t1)) return true;
  
  // Check if they share any word of length >= 4
  const words1 = t1.split(/\s+/).filter(w => w.length >= 4);
  const words2 = t2.split(/\s+/).filter(w => w.length >= 4);
  
  for (const w1 of words1) {
    if (words2.includes(w1)) return true;
  }
  return false;
}

// Server-side master-level filename cleaner to extract title and artist
function cleanFilenameLocally(filename: string): { title: string; artist: string; cleanQuery: string } {
  // Clean downloader/website prefixes/suffixes and brackets
  let base = cleanDownloaderClutter(filename);

  // 1. Strip file extension
  base = base.replace(/\.(mp3|wav|m4a|flac|aac|ogg|wma)$/i, "");

  // 2. Remove common video downloader clutter, streaming platform names, and quality tags
  base = base
    .replace(/(y2mate\.com|y2mate|youtube|spotify|soundcloud|wynk|gaana|jiosaavn)\s*[-_]?\s*/gi, "")
    .replace(/\b(320kbps|128kbps|256kbps|vbr|kbps|hq|hd|flac|mp3|m4a|cd|remaster|remastered|mono|stereo)\b/gi, "")
    .replace(/\s*[([].*?(official|video|audio|lyrics|lyric|hd|mp3|320|kbps|hq|remaster|remastered|music video|lyric video|original mix).*?[\])]/gi, "")
    .replace(/\s*(official|video|audio|lyrics|lyric|video clip|music video|full song|original mix)\s*/gi, "")
    .trim();

  // 3. Strip leading track numbers like "01 - ", "01. ", "01 ", "1. ", "01_" at the start of the filename
  base = base.replace(/^\s*\d+[\s.-_]+/, "").trim();

  // 4. Split by common separators to find Artist and Title
  let artist = "Unknown Artist";
  let title = base;

  const splitters = [" - ", " -", "- ", "-", " | ", "|", " ~ ", "~"];
  for (const splitter of splitters) {
    if (base.includes(splitter)) {
      const parts = base.split(splitter);
      artist = parts[0].trim();
      title = parts.slice(1).join(splitter).trim();
      break;
    }
  }

  // Double-check if the artist name has some residual track numbers, e.g. "01 Artist"
  artist = artist.replace(/^\s*\d+[\s.-_]+/, "").trim();

  // Clean any multiple consecutive spaces
  title = title.replace(/\s+/g, " ").trim();
  artist = artist.replace(/\s+/g, " ").trim();

  return {
    title,
    artist,
    cleanQuery: `${artist === "Unknown Artist" ? "" : artist} ${title}`.trim()
  };
}

// Parse standard LRC format string into synchronized lines
function parseLrc(lrcText: string): Array<{ time: number; text: string }> {
  if (!lrcText) return [];
  const lines = lrcText.split(/\r?\n/);
  const result: Array<{ time: number; text: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Matches standard LRC tags like [01:23.45], [01:23.456], [01:23] or [01:23:45]
    const timestampRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
    let match;
    const times: number[] = [];

    while ((match = timestampRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        times.push(minutes * 60 + seconds);
      }
    }

    if (times.length > 0) {
      const cleanText = trimmed.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();
      
      // Skip bracketed metadata lines like [offset:0] or [re:lrclib]
      if (cleanText.startsWith("[") && cleanText.endsWith("]")) continue;
      
      for (const time of times) {
        result.push({ time, text: cleanText });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

// Fetch lyrics from lyrics.ovh public API as a secondary fallback
async function fetchLyricsOvh(title: string, artist: string): Promise<string> {
  const cleanArtist = artist && artist !== "Unknown Artist" ? artist.trim() : "";
  const cleanTitle = title ? title.trim() : "";
  
  if (cleanArtist && cleanTitle) {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data: any = await response.json();
        if (data && data.lyrics) {
          return data.lyrics;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch lyrics from lyrics.ovh:", e);
    }
  }
  return "";
}

// Algorithmic smart line synchronization based on song duration (tertiary fallback)
function generateEvenlySpacedLyrics(lyricsText: string, durationSec: number): Array<{ time: number; text: string }> {
  const lines = lyricsText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (line.startsWith("[") && line.endsWith("]")) return false;
      if (line.startsWith("(") && line.endsWith(")")) return false;
      return true;
    });

  if (lines.length === 0) {
    return [
      { time: 5, text: "Lyrics instrumental break / music playback" }
    ];
  }

  const duration = durationSec || 180;
  const startTime = Math.min(10, duration * 0.08); 
  const endTime = duration - Math.min(15, duration * 0.08);

  const count = lines.length;
  if (count === 1) {
    return [{ time: startTime, text: lines[0] }];
  }

  const step = (endTime - startTime) / (count - 1);
  return lines.map((text, idx) => {
    const time = parseFloat((startTime + idx * step).toFixed(1));
    return { time, text };
  });
}

// Main LRCLIB integration to fetch/search synchronized lyrics
async function fetchLyricsLrcLib(title: string, artist: string, duration?: number): Promise<{ lyrics: string; syncedLyrics: Array<{ time: number; text: string }> } | null> {
  const cleanArtist = artist && artist !== "Unknown Artist" ? artist.trim() : "";
  const cleanTitle = title ? title.trim() : "";

  if (!cleanTitle) return null;

  // Attempt 1: Call exact get API
  let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}`;
  if (cleanArtist) {
    url += `&artist_name=${encodeURIComponent(cleanArtist)}`;
  }
  if (duration && duration > 0) {
    url += `&duration=${Math.round(duration)}`;
  }

  console.log(`[LRCLIB] Attempting exact get: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LyricFinderApp/1.0 (def.not.manas@gmail.com)"
      }
    });
    if (response.ok) {
      const data: any = await response.json();
      if (data) {
        console.log(`[LRCLIB] Exact match found!`);
        return processLrcLibResponse(data, duration);
      }
    }
  } catch (e) {
    console.warn("[LRCLIB] Exact get request failed:", e);
  }

  // Attempt 2: Search endpoint with combined query
  const query = cleanArtist ? `${cleanArtist} ${cleanTitle}` : cleanTitle;
  const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
  console.log(`[LRCLIB] Attempting search query: ${searchUrl}`);
  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "LyricFinderApp/1.0 (def.not.manas@gmail.com)"
      }
    });
    if (response.ok) {
      const results: any[] = await response.json();
      if (results && results.length > 0) {
        // Match close duration if available, else select the first result
        let bestMatch = results[0];
        if (duration && duration > 0) {
          let minDiff = Infinity;
          for (const item of results) {
            const diff = Math.abs((item.duration || 0) - duration);
            if (diff < minDiff) {
              minDiff = diff;
              bestMatch = item;
            }
          }
        }
        console.log(`[LRCLIB] Search match found! selected: "${bestMatch.trackName}" by "${bestMatch.artistName}"`);
        return processLrcLibResponse(bestMatch, duration);
      }
    }
  } catch (e) {
    console.warn("[LRCLIB] Search query request failed:", e);
  }

  return null;
}

// Convert LRCLIB result format into the schema format
function processLrcLibResponse(data: any, defaultDuration?: number): { lyrics: string; syncedLyrics: Array<{ time: number; text: string }> } {
  const duration = data.duration || defaultDuration || 180;
  
  if (data.instrumental) {
    return {
      lyrics: "[Instrumental Track]\nEnjoy the music playback!",
      syncedLyrics: [
        { time: 5, text: "🎵 [Instrumental Break] 🎵" }
      ]
    };
  }

  if (data.syncedLyrics && data.syncedLyrics.trim()) {
    const parsed = parseLrc(data.syncedLyrics);
    if (parsed && parsed.length > 0) {
      return {
        lyrics: data.plainLyrics || data.syncedLyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, ""),
        syncedLyrics: parsed
      };
    }
  }

  if (data.plainLyrics && data.plainLyrics.trim()) {
    return {
      lyrics: data.plainLyrics,
      syncedLyrics: generateEvenlySpacedLyrics(data.plainLyrics, duration)
    };
  }

  return {
    lyrics: "Lyrics available.",
    syncedLyrics: [
      { time: 5, text: "Lyrics loaded, karaoke starting..." }
    ]
  };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Middleware for body parsing
  app.use(express.json({ limit: "10mb" }));

  // API Route: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

   // API Route: Identify Song Title, Artist & Album from Filename/Clutter and fetch Album Cover via iTunes
  app.post("/api/songs/identify", async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename) {
        res.status(400).json({ error: "Filename is required" });
        return;
      }

      console.log(`[Identify] Raw filename request: "${filename}"`);
      const localClean = cleanFilenameLocally(filename);
      console.log(`[Identify] Local clean: title="${localClean.title}", artist="${localClean.artist}"`);

      let finalTitle = localClean.title;
      let finalArtist = localClean.artist;
      let finalAlbum = "Unknown Album";
      let finalAlbumCover = "";
      let foundOniTunes = false;

      // STEP 1: Fast direct lookup on iTunes Search API (instant, saves Gemini quota)
      try {
        const query = localClean.cleanQuery;
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
        const searchResponse = await fetch(searchUrl);
        if (searchResponse.ok) {
          const searchData: any = await searchResponse.json();
          if (searchData && searchData.results && searchData.results.length > 0) {
            const item = searchData.results[0];
            const isConf = isConfidentMatch(localClean.title, item.trackName || "");
            
            if (isConf) {
              finalTitle = item.trackName || finalTitle;
              finalArtist = item.artistName || finalArtist;
              finalAlbum = item.collectionName || "Unknown Album";
              if (item.artworkUrl100) {
                finalAlbumCover = item.artworkUrl100.replace("100x100bb", "600x600bb");
              }
              foundOniTunes = true;
              console.log(`[Identify] Confident direct iTunes match: "${finalTitle}" by "${finalArtist}"`);
            } else {
              console.log(`[Identify] Direct iTunes match found ("${item.trackName}" by "${item.artistName}"), but failed confidence check with local title "${localClean.title}". Proceeding to Gemini fallback...`);
            }
          }
        }
      } catch (iTunesError) {
        console.warn("[Identify] Direct iTunes lookup failed:", iTunesError);
      }

      // STEP 2: Smart AI parse fallback if direct iTunes search yielded nothing or failed confidence check
      if (!foundOniTunes) {
        console.log(`[Identify] Calling Groq parsing fallback...`);
        try {
          const userPrompt = `Analyze the audio file name: "${filename}"
Identify the correct official song details.

Note: many of these files are actually music videos that were saved/converted to .mp3,
so the filename is often very long and cluttered, e.g. containing things like
"(Official Music Video)", "(Official Video)", "[Lyric Video]", "HD", "4K", "Full Song",
upload years, resolution tags, or channel names. Ignore all of that clutter entirely -
it is never part of the real song title or artist.

We need:
1. "title": The official song title (e.g., "Vizhi Moodi" or "Gerua" or "Tum Hi Ho").
2. "artist": The primary official artist or singer(s) (e.g., "Harris Jayaraj" or "Arijit Singh").
3. "album": The official album/movie name (e.g., "Ayan" or "Dilwale" or "Aashiqui 2").

Make sure to strip any web downloader prefixes, suffixes, bitrates, years, or site names (like MassTamilan, Isaimini, Pagalworld, etc.).
Return your output as a valid JSON object matching the schema:
{
  "title": "...",
  "artist": "...",
  "album": "..."
}`;

          let responseText = "";
          try {
            console.log(`[Identify] Attempting Groq call...`);
            responseText = await callWithRetry(async () => {
              return await callGroqAPI(
                userPrompt,
                true,
                "You are an expert music metadata analyzer. You MUST extract the song Title, Artist, and Album name. Output matching the requested JSON schema. Do not include any explanations outside of the schema."
              );
            });
          } catch (groqError: any) {
            console.warn(`[Identify] Groq call failed: ${groqError.message || groqError}.`);
          }

          if (responseText) {
            const identifiedData = JSON.parse(responseText.trim());
            console.log(`[Identify] Groq parsed:`, identifiedData);
            if (identifiedData.title) finalTitle = identifiedData.title;
            if (identifiedData.artist) finalArtist = identifiedData.artist;
            if (identifiedData.album) finalAlbum = identifiedData.album;

            // Search iTunes again with the high-quality Groq extracted metadata to fetch the album artwork
            try {
              const query = `${finalTitle} ${finalArtist}`.trim();
              const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
              const searchResponse = await fetch(searchUrl);
              if (searchResponse.ok) {
                const searchData: any = await searchResponse.json();
                if (searchData && searchData.results && searchData.results.length > 0) {
                  const item = searchData.results[0];
                  if (item.artworkUrl100) {
                    finalAlbumCover = item.artworkUrl100.replace("100x100bb", "600x600bb");
                  }
                  // Backfill album name if missing or unknown
                  if (finalAlbum === "Unknown Album" && item.collectionName) {
                    finalAlbum = item.collectionName;
                  }
                  console.log(`[Identify] iTunes match after Groq: artwork found for "${finalTitle}"`);
                }
              }
            } catch (innerITunesError) {
              console.warn("[Identify] iTunes match after Groq failed:", innerITunesError);
            }
          }
        } catch (groqError: any) {
          console.warn("[Identify] Smart Groq fallback failed, using local clean info only:", groqError);
        }
      }

      res.json({
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        albumCover: finalAlbumCover,
      });
    } catch (error: any) {
      console.error("Error in song identification endpoint:", error);
      res.status(500).json({
        error: error.message || "An error occurred while identifying song details.",
      });
    }
  });

  // API Route: Find and Sync Lyrics using LRCLIB API with fallbacks, including search-grounded Gemini recovery
  app.post("/api/lyrics/find", async (req, res) => {
    try {
      const { title, artist, duration, originalFilename } = req.body;

      if (!title) {
        res.status(400).json({ error: "Song title is required" });
        return;
      }

      console.log(`[Lyrics] Finding lyrics for "${title}" by "${artist || "Unknown"}" (duration: ${duration}s)`);

      let finalLyrics = "";
      let finalSynced: Array<{ time: number; text: string }> = [];
      let finalTitle = title;
      let finalArtist = artist || "Unknown Artist";

      // TIER 1: Fetch from LRCLIB (Supports fully synchronized syncedLyrics + plainLyrics)
      try {
        const lrcLibResult = await fetchLyricsLrcLib(title, artist, duration);
        if (lrcLibResult) {
          finalLyrics = lrcLibResult.lyrics;
          finalSynced = lrcLibResult.syncedLyrics;
          console.log(`[Lyrics] Success retrieving lyrics from LRCLIB`);
        }
      } catch (lrcLibError) {
        console.warn("[Lyrics] LRCLIB lyrics lookup failed:", lrcLibError);
      }

      // TIER 2: Fallback to lyrics.ovh if LRCLIB returned nothing
      if (!finalLyrics || finalLyrics.trim() === "") {
        console.log(`[Lyrics] Falling back to lyrics.ovh (Tier 2)...`);
        try {
          const ovhLyrics = await fetchLyricsOvh(title, artist);
          if (ovhLyrics && ovhLyrics.trim()) {
            finalLyrics = ovhLyrics;
            finalSynced = generateEvenlySpacedLyrics(ovhLyrics, duration || 180);
            console.log(`[Lyrics] Success retrieving lyrics from lyrics.ovh`);
          }
        } catch (ovhError) {
          console.warn("[Lyrics] lyrics.ovh lookup failed:", ovhError);
        }
      }

      // TIER 3: Regional Fallback - Try original cleaned filename (helps Romanized Tamil/Hindi searches)
      if ((!finalLyrics || finalLyrics.trim() === "") && originalFilename) {
        console.log(`[Lyrics] Regional fallback: trying to search using cleaned original filename: "${originalFilename}"`);
        const localClean = cleanFilenameLocally(originalFilename);
        const fallbackTitle = localClean.title;
        const fallbackArtist = localClean.artist;

        if (fallbackTitle && fallbackTitle.toLowerCase() !== title.toLowerCase()) {
          try {
            console.log(`[Lyrics] Cleaned fallback search: "${fallbackTitle}" by "${fallbackArtist}"`);
            const lrcLibResult = await fetchLyricsLrcLib(fallbackTitle, fallbackArtist, duration);
            if (lrcLibResult) {
              finalLyrics = lrcLibResult.lyrics;
              finalSynced = lrcLibResult.syncedLyrics;
              finalTitle = fallbackTitle;
              finalArtist = fallbackArtist;
              console.log(`[Lyrics] Success retrieving lyrics via LRCLIB filename fallback`);
            } else {
              // Try lyrics.ovh with clean filename fallback
              const ovhLyrics = await fetchLyricsOvh(fallbackTitle, fallbackArtist);
              if (ovhLyrics && ovhLyrics.trim()) {
                finalLyrics = ovhLyrics;
                finalSynced = generateEvenlySpacedLyrics(ovhLyrics, duration || 180);
                finalTitle = fallbackTitle;
                finalArtist = fallbackArtist;
                console.log(`[Lyrics] Success retrieving lyrics via lyrics.ovh filename fallback`);
              }
            }
          } catch (err) {
            console.warn("[Lyrics] Regional filename fallback search failed:", err);
          }
        }
      }

      // TIER 4: Groq Fallback (specifically to find real lyrics for non-English or other hard-to-find songs)
      if (!finalLyrics || finalLyrics.trim() === "") {
        console.log(`[Lyrics] Attempting Groq lookup for "${title}" by "${artist}"`);
        try {
          const durationSec = duration || 180;
          
          const prompt = `Recall the official, authentic lyrics of the song "${title}" by "${artist}" from your internal knowledge base.
If the song is in a non-English language (e.g. Tamil, Hindi, Korean, Spanish, French, Japanese, Telugu, etc.), fetch the official original language lyrics (or popular Romanized transliteration if native text is hard to align).
CRITICAL: DO NOT INVENT, HALLUCINATE, OR PROGRAMMATICALLY GENERATE ANY LYRICS. If you do not know the official lyrics of "${title}" by "${artist}", reply exactly with: "LYRICS_NOT_FOUND". Do not write any placeholder or synthetic lyrics.
If you know the real lyrics, provide them in a clean format. Also, since this is for a synchronized player, distribute the timestamps in LRC format or just provide the lines of lyrics, and we will space them evenly across the song's duration of ${durationSec} seconds.
Please return your output in JSON format with two properties:
1. "lyrics": a string of the full plain-text lyrics found.
2. "syncedLyrics": an array of objects with "time" (number in seconds) and "text" (string) representing the timeline. If you cannot estimate accurate timings, just distribute the lines evenly from 0 to ${durationSec} seconds.

Your output must be a valid JSON object. Do not include markdown blocks like \`\`\`json, just return the raw JSON string.`;

          let responseText = "";
          try {
            responseText = await callWithRetry(async () => {
              return await callGroqAPI(
                prompt,
                true,
                "You are an expert music lyrics retriever. You must look up or recall the exact official lyrics. Do not invent any lyrics under any circumstances. If unknown, output {\"lyrics\": \"LYRICS_NOT_FOUND\", \"syncedLyrics\": []}."
              );
            });
          } catch (groqError: any) {
            console.warn(`[Lyrics] Groq lyrics call failed: ${groqError.message || groqError}.`);
          }

          if (responseText && !responseText.includes("LYRICS_NOT_FOUND")) {
            const data = JSON.parse(responseText.trim());
            if (data.lyrics && data.lyrics.trim().length > 0) {
              finalLyrics = data.lyrics;
              finalSynced = Array.isArray(data.syncedLyrics) 
                ? data.syncedLyrics.map((l: any) => ({
                    time: parseFloat(l.time) || 0,
                    text: String(l.text || ""),
                  }))
                : generateEvenlySpacedLyrics(data.lyrics, durationSec);
              console.log(`[Lyrics] Success retrieving lyrics via Groq`);
            }
          }
        } catch (groqError) {
          console.error("[Lyrics] Groq lyric lookup failed:", groqError);
        }
      }

      // If all tiers failed, return 404 "No lyrics found"
      if (!finalLyrics || finalLyrics.trim() === "") {
        console.log(`[Lyrics] No lyrics found on LRCLIB, lyrics.ovh or Groq. Aborting search.`);
        res.status(404).json({
          error: "No lyrics found for this song. Try editing the filename or entering a custom query."
        });
        return;
      }

      res.json({
        lyrics: finalLyrics,
        syncedLyrics: finalSynced,
        title: finalTitle,
        artist: finalArtist,
        explanation: "Resilient lyric syncing applied"
      });
    } catch (error: any) {
      console.error("Error in lyric finder endpoint:", error);
      res.status(500).json({
        error: error.message || "An error occurred while finding lyrics.",
      });
    }
  });

  // API Route: AI-powered syncing and parsing of dropped LRC, SRT, or TXT lyric files
  app.post("/api/lyrics/sync-dropped", async (req, res) => {
    try {
      const { title, artist, duration, fileType, fileContent } = req.body;

      if (!fileContent) {
        res.status(400).json({ error: "File content is required" });
        return;
      }

      const songTitle = title || "Unknown Song";
      const songArtist = artist || "Unknown Artist";
      const songDuration = duration || 180;

      console.log(`[Sync Dropped] Syncing dropped ${fileType} file for "${songTitle}" by "${songArtist}"`);

      let lyrics = "";
      let syncedLyrics: Array<{ time: number; text: string }> = [];

      if (fileType === "txt") {
        // Plain text: Use Groq to automatically sync text lines to the song duration!
        const prompt = `You are an AI Karaoke Synchronizer. We have a plain text lyric file for the song "${songTitle}" by "${songArtist}" (Duration: ${songDuration} seconds).
The text of the lyrics is:
${fileContent}

Your task is to analyze the song's structure and timing. Assign highly suitable timestamps (in seconds from 0 to ${songDuration}) to each line of these lyrics so that they sync with the song playback.
Ensure the timestamps are realistic (e.g., standard intro instrumental of 10-20 seconds, spacing between lines, verses, choruses, and final outro).
Return your output as a valid JSON object with:
1. "lyrics": the full plain-text lyrics.
2. "syncedLyrics": a JSON array of objects, where each object has "time" (number of seconds, e.g. 15.4) and "text" (string of the lyric line).

Your response must be a valid JSON object. Do not include markdown blocks like \`\`\`json, just return the raw JSON string.`;

        const responseText = await callWithRetry(async () => {
          return await callGroqAPI(
            prompt,
            true,
            "You are a helpful karaoke lyric synchronizer assistant. Output only a valid JSON object."
          );
        });

        const data = JSON.parse(responseText.trim());
        lyrics = data.lyrics || fileContent;
        syncedLyrics = Array.isArray(data.syncedLyrics) ? data.syncedLyrics : [];
      } else {
        // LRC or SRT files: They already have timestamps, but we can use Groq to parse them perfectly,
        // clean up subtitle metadata/junk, remove timing overlaps, and align them.
        const prompt = `You are an AI Lyric File Parser. We have a dropped ${fileType.toUpperCase()} file for the song "${songTitle}" by "${songArtist}".
Raw file content:
${fileContent}

Your task is to parse this ${fileType.toUpperCase()} file and return a structured JSON output.
1. Extract all the lyrics lines.
2. Convert all timestamps to standard numbers representing elapsed seconds (e.g. "[01:12.50]" becomes 72.5). For SRT files, parse the starting time of the subtitle chunk in seconds (e.g. "00:01:20,500" becomes 80.5).
3. Clean up any subtitle author credits, advertisements, or technical noise (e.g. "Synced by...", "Subtitles by...", "Downloaded from...").
4. Correct minor typos or character encoding issues.

Return a JSON object with:
1. "lyrics": a clean, plain-text string of the full lyrics without timestamps.
2. "syncedLyrics": an array of objects, where each object has "time" (number in seconds) and "text" (string of the lyric line).

Your response must be a valid JSON object. Do not include markdown blocks like \`\`\`json, just return the raw JSON string.`;

        const responseText = await callWithRetry(async () => {
          return await callGroqAPI(
            prompt,
            true,
            "You are an expert subtitle and lyric parser. Output only a valid JSON object."
          );
        });

        const data = JSON.parse(responseText.trim());
        lyrics = data.lyrics || "";
        syncedLyrics = Array.isArray(data.syncedLyrics) ? data.syncedLyrics : [];
      }

      // Fallback in case of parsing failures
      if (syncedLyrics.length === 0) {
        throw new Error("Could not parse synced lyrics lines from the file.");
      }

      res.json({
        lyrics,
        syncedLyrics,
        title: songTitle,
        artist: songArtist
      });
    } catch (error: any) {
      console.error("Error in sync-dropped API:", error);
      res.status(500).json({
        error: error.message || "Failed to process and sync the dropped lyric file.",
      });
    }
  });

  // API Route: AI-powered translation of lyrics
  app.post("/api/lyrics/translate", async (req, res) => {
    try {
      const { lyrics, syncedLyrics, language } = req.body;

      if (!lyrics) {
        res.status(400).json({ error: "Lyrics content is required" });
        return;
      }
      if (!language) {
        res.status(400).json({ error: "Target language is required" });
        return;
      }

      console.log(`[Translate] Translating lyrics to ${language}`);

      let translatedLyrics = "";
      let translatedSynced: any[] = [];

      // 1. Translate plain lyrics
      const plainPrompt = `Translate the following song lyrics line-by-line into ${language}.
Keep the translation poetic and aligned with the original song structure.
Do not add any explanations, introductory text, formatting blocks, or translator notes. Just return the translated lines matching the input structure exactly.

Input lyrics:
${lyrics}`;

      const plainText = await callWithRetry(async () => {
        return await callGroqAPI(
          plainPrompt,
          false,
          "You are a poetic translator. Do not explain anything, just translate the text exactly line-by-line."
        );
      });
      translatedLyrics = plainText.trim();

      // 2. Translate synced lines if provided
      if (Array.isArray(syncedLyrics) && syncedLyrics.length > 0) {
        const syncedPrompt = `Translate each of these lyric lines into ${language}.
Return a JSON array of objects, where each object has:
1. "time": the EXACT same number from the input line (do not modify this).
2. "text": the translated string for that line.

Keep the translation poetic and accurate to the original song's meaning.
Ensure the response is a valid JSON object containing a "translations" key which is an array of objects. Do not include markdown blocks like \`\`\`json, just return the raw JSON.

Input lines:
${JSON.stringify(syncedLyrics.map((l: any) => ({ time: l.time, text: l.text })))}`;

        const syncedResponseText = await callWithRetry(async () => {
          return await callGroqAPI(
            syncedPrompt,
            true,
            "You are an expert poetic translator. Always output a valid JSON object containing a 'translations' key which is a JSON array."
          );
        });

        try {
          const parsed = JSON.parse(syncedResponseText.trim());
          const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.translations) ? parsed.translations : []);
          if (Array.isArray(list)) {
            translatedSynced = list.map((l: any) => ({
              time: parseFloat(l.time) || 0,
              text: String(l.text || ""),
            }));
          }
        } catch (e) {
          console.warn("[Translate] Failed to parse synced translation, falling back", e);
        }
      }

      res.json({
        translatedLyrics,
        translatedSynced,
      });
    } catch (error: any) {
      console.error("Error in translate API:", error);
      res.status(500).json({
        error: error.message || "Failed to translate lyrics.",
      });
    }
  });

  // Vite middleware for development, static assets for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware integrated.");
  } else {
    const distPath = process.env.STATIC_DIR || path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production assets from:", distPath);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
