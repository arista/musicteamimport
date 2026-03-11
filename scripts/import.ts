/**
 * Import songs from songs.json into MusicTeam.
 *
 * Usage: npm run import -- <delay_seconds>
 *   delay_seconds - Required. Seconds to wait between importing each song.
 *
 * Environment variables (both required):
 *   MUSICTEAM_API_URL - Base URL (e.g., https://musicteam.gutwin.org)
 *   MUSICTEAM_API_KEY - API key for authentication
 *
 * Reads: data/songs.json, data/musicteam-songs.json, config.json
 * Updates: data/songs.json (adds musicteam IDs after each song)
 *
 * The script can be safely interrupted and restarted - it skips songs
 * that already have musicteam IDs.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

interface MySong {
  id: string;
  folderName: string;
  title: string;
  ccliNumber: number | null;
  authors: string[];
  copyright: string;
  isPublicDomain: boolean;
  lyricsFile: string;
  verseOrder: string;
  tags: string[];
  mediaLinks: { url: string; musicteam?: { song_media_id: string } }[];
  notes: string;
  sheets: MySheet[];
  musicteam?: {
    song_id: string;
    song_version_id: string;
  };
}

interface MySheet {
  filePath: string;
  fileName: string;
  key: string;
  type: string;
  typeOther: string;
  includesVerseOrder: boolean;
  fileSize: number;
  isPrimary: boolean;
  musicteam?: {
    song_sheet_id: string;
  };
}

interface MusicTeamSong {
  id: string;
  title: string;
  authors: string[];
  ccliNumber: number | null;
  tags: string[];
}

interface SongsJson {
  extractedAt: string;
  songsDir: string;
  songs: MySong[];
}

interface MusicTeamSongsJson {
  extractedAt: string;
  source: string;
  songs: MusicTeamSong[];
}

// ============================================================================
// Configuration - Reconciliation decisions from docs/reconciliation.md
// ============================================================================

// These matched songs should become NEW songs instead
const forceNewSongs = new Set([
  "all-creatures-of-our-god-and-king",
  "cornerstone-our-hope-is-built",
  "love-lifted-me-rowe",
]);

// Songs that should have authors added (for matched songs)
const addAuthorsFor = new Set([
  "for-your-gift-of-god-the-spirit",
]);

// Song pairs that should become versions of the same MusicTeam song
const versionPairs: { mtSongId: string; versions: { myId: string; label: string }[] }[] = [
  {
    mtSongId: "s:3f21c3d3-5b3f-4d31-8b14-d7d03cc24c07",
    versions: [
      { myId: "celebrate-jesus", label: "From Nathan" },
      { myId: "celebrate-jesus-easier", label: "From Nathan (easier)" },
    ],
  },
  {
    mtSongId: "s:a1f8f058-75ce-4d8f-a9f6-2e0f86ca1c6a",
    versions: [
      { myId: "o-how-i-love-jesus", label: "From Nathan" },
      { myId: "o-how-i-love-jesus-there-is-a-name-i-love-to-hear", label: "From Nathan (hymn 509)" },
    ],
  },
  {
    mtSongId: "s:67df24d4-9397-4682-add6-ca054e4c6d44",
    versions: [
      { myId: "come-thou-long-expected-jesus", label: "From Nathan" },
      { myId: "come-thou-long-expected-jesus-extra-ending", label: "From Nathan (extra ending)" },
    ],
  },
];

// Manual matches (my title -> MusicTeam song ID)
const manualMatches = new Map<string, string>([
  ["More Love, O Christ, To Thee", "s:4d0a81ad-1af4-4647-ae05-eb914b8cc910"],
  ["Silent Night, Holy Night", "s:ecfadeea-f6e8-4b60-bb24-4bbfa6831834"],
  ["The Wise Man Built His House", "s:401749a4-29e1-4d37-95fc-d42438df51ec"],
]);

// ============================================================================
// Environment and Config
// ============================================================================

const API_URL = process.env.MUSICTEAM_API_URL;
const API_KEY = process.env.MUSICTEAM_API_KEY;

if (!API_URL) {
  console.error("Error: MUSICTEAM_API_URL environment variable is required");
  process.exit(1);
}

if (!API_KEY) {
  console.error("Error: MUSICTEAM_API_KEY environment variable is required");
  process.exit(1);
}

// Parse delay argument
const delayArg = process.argv[2];
if (!delayArg) {
  console.error("Error: delay argument is required");
  console.error("Usage: npm run import -- <delay_seconds>");
  console.error("Example: npm run import -- 2");
  process.exit(1);
}

const delaySeconds = parseFloat(delayArg);
if (isNaN(delaySeconds) || delaySeconds < 0) {
  console.error("Error: delay must be a non-negative number");
  process.exit(1);
}

const delayMs = delaySeconds * 1000;

// Load config
const configPath = join(process.cwd(), "config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const worshipSetsRoot: string = config.worshipSetsRoot;

// ============================================================================
// Helper Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const domainParts = hostname.split(".");
    const domain = domainParts[0];
    // Capitalize first letter
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return "Link";
  }
}

function readLyrics(song: MySong): string {
  if (!song.lyricsFile) return "";
  const lyricsPath = join(worshipSetsRoot, "sheets", song.folderName, song.lyricsFile);
  try {
    const content = readFileSync(lyricsPath, "utf-8");
    // Skip the first 4 header lines (title, ccli, authors, copyright)
    const lines = content.split("\n");
    return lines.slice(4).join("\n").trim();
  } catch {
    return "";
  }
}

function readPdfAsBase64(song: MySong, sheet: MySheet): string {
  const pdfPath = join(worshipSetsRoot, "sheets", song.folderName, sheet.filePath);
  const buffer = readFileSync(pdfPath);
  return buffer.toString("base64");
}

// ============================================================================
// API Functions
// ============================================================================

async function apiFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "x-api-key": API_KEY!,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${res.statusText} for ${endpoint}\n${text}`);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

async function uploadFile(base64Data: string): Promise<string> {
  const url = `${API_URL}/objects?base64=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY!,
      "Content-Type": "text/plain",
    },
    body: base64Data,
  });

  if (!res.ok) {
    throw new Error(`Upload error ${res.status}: ${res.statusText}`);
  }

  const result = await res.json() as { id: string };
  return result.id;
}

// Song operations
async function createSong(song: MySong): Promise<string> {
  const result = await apiFetch<{ id: string }>("/songs", {
    method: "POST",
    body: {
      title: song.title,
      authors: song.authors,
      ccli_num: song.ccliNumber,
      tags: song.tags,
    },
  });
  return result.id;
}

async function updateSong(
  songId: string,
  updates: { tags?: string[]; authors?: string[] }
): Promise<void> {
  await apiFetch(`/songs/${songId}`, {
    method: "PUT",
    body: updates,
  });
}

async function getSong(songId: string): Promise<MusicTeamSong | null> {
  try {
    return await apiFetch<MusicTeamSong>(`/songs/${songId}`);
  } catch {
    return null;
  }
}

// Comment operations
async function addComment(resourceId: string, comment: string): Promise<void> {
  await apiFetch(`/comments/${resourceId}`, {
    method: "POST",
    body: { comment },
  });
}

// Version operations
async function createVersion(
  songId: string,
  label: string,
  verseOrder: string,
  lyrics: string
): Promise<string> {
  const result = await apiFetch<{ id: string }>(`/songs/${songId}/versions`, {
    method: "POST",
    body: {
      label,
      verse_order: verseOrder || null,
      lyrics: lyrics || null,
      tags: [],
    },
  });
  return result.id;
}

// Media operations
async function createMedia(
  songId: string,
  versionId: string,
  title: string,
  url: string
): Promise<string> {
  const result = await apiFetch<{ id: string }>(
    `/songs/${songId}/versions/${versionId}/media`,
    {
      method: "POST",
      body: { title, url },
    }
  );
  return result.id;
}

// Sheet operations
async function createSheet(
  songId: string,
  versionId: string,
  sheet: MySheet,
  objectId: string
): Promise<string> {
  const tags = sheet.isPrimary ? ["primary"] : [];
  const type = sheet.typeOther || sheet.type;

  const result = await apiFetch<{ id: string }>(
    `/songs/${songId}/versions/${versionId}/sheets`,
    {
      method: "POST",
      body: {
        type,
        key: sheet.key,
        object_id: objectId,
        object_type: "application/pdf",
        auto_verse_order: !sheet.includesVerseOrder,
        tags,
      },
    }
  );
  return result.id;
}

// ============================================================================
// Main Import Logic
// ============================================================================

async function importSongs() {
  // Load data
  const songsPath = join(process.cwd(), "data", "songs.json");
  const mtSongsPath = join(process.cwd(), "data", "musicteam-songs.json");

  const songsData: SongsJson = JSON.parse(readFileSync(songsPath, "utf-8"));
  const mtSongsData: MusicTeamSongsJson = JSON.parse(readFileSync(mtSongsPath, "utf-8"));

  const mySongs = songsData.songs;
  const mtSongs = mtSongsData.songs;

  // Build lookup maps for matching
  const mtByCcli = new Map<number, MusicTeamSong>();
  const mtByTitle = new Map<string, MusicTeamSong>();
  const mtById = new Map<string, MusicTeamSong>();

  for (const song of mtSongs) {
    if (song.ccliNumber) {
      mtByCcli.set(song.ccliNumber, song);
    }
    mtByTitle.set(normalizeTitle(song.title), song);
    mtById.set(song.id, song);
  }

  // Build version pair lookup
  const versionPairLookup = new Map<string, { mtSongId: string; label: string }>();
  for (const pair of versionPairs) {
    for (const v of pair.versions) {
      versionPairLookup.set(v.myId, { mtSongId: pair.mtSongId, label: v.label });
    }
  }

  console.log(`Importing ${mySongs.length} songs to ${API_URL}`);
  console.log(`Delay between songs: ${delaySeconds}s`);
  console.log();

  let created = 0;
  let matched = 0;
  let errors = 0;

  for (let i = 0; i < mySongs.length; i++) {
    const mySong = mySongs[i];
    const progress = `[${i + 1}/${mySongs.length}]`;

    try {
      // Skip if already imported
      if (mySong.musicteam?.song_id && mySong.musicteam?.song_version_id) {
        console.log(`${progress} ${mySong.title} - already imported, skipping`);
        continue;
      }

      // Determine action for this song
      let mtSongId: string | null = null;
      let versionLabel = "From Nathan";
      let isNewSong = false;
      let tagsToAdd: string[] = [];
      let authorsToAdd: string[] = [];

      // Check if this is part of a version pair
      const versionPairInfo = versionPairLookup.get(mySong.id);
      if (versionPairInfo) {
        mtSongId = versionPairInfo.mtSongId;
        versionLabel = versionPairInfo.label;
      }
      // Check if forced to be new song
      else if (forceNewSongs.has(mySong.id)) {
        isNewSong = true;
      }
      // Try to find a match
      else {
        let mtSong: MusicTeamSong | undefined;

        // Manual match
        const manualId = manualMatches.get(mySong.title);
        if (manualId) {
          mtSong = mtById.get(manualId);
        }

        // CCLI match
        if (!mtSong && mySong.ccliNumber) {
          mtSong = mtByCcli.get(mySong.ccliNumber);
        }

        // Title match
        if (!mtSong) {
          mtSong = mtByTitle.get(normalizeTitle(mySong.title));
        }

        if (mtSong) {
          mtSongId = mtSong.id;

          // Calculate tags to add
          const existingTagsLower = mtSong.tags.map(t => t.toLowerCase());
          tagsToAdd = mySong.tags.filter(
            t => !existingTagsLower.includes(t.toLowerCase())
          );

          // Check if we should add authors
          if (addAuthorsFor.has(mySong.id)) {
            const existingAuthorsLower = mtSong.authors.map(a => a.toLowerCase());
            authorsToAdd = mySong.authors.filter(
              a => !existingAuthorsLower.includes(a.toLowerCase())
            );
          }
        } else {
          isNewSong = true;
        }
      }

      // Execute the import
      if (isNewSong) {
        // Create new song
        console.log(`${progress} ${mySong.title} - creating new song`);
        mtSongId = await createSong(mySong);
        created++;
      } else if (mtSongId) {
        // Verify the matched song exists
        const existingSong = await getSong(mtSongId);
        if (!existingSong) {
          // Song not found (maybe running against local), create as new
          console.log(`${progress} ${mySong.title} - matched song not found, creating new`);
          mtSongId = await createSong(mySong);
          created++;
          isNewSong = true;
        } else {
          console.log(`${progress} ${mySong.title} - adding version to ${existingSong.title}`);
          matched++;

          // Update tags/authors if needed
          if (tagsToAdd.length > 0 || authorsToAdd.length > 0) {
            const updates: { tags?: string[]; authors?: string[] } = {};
            if (tagsToAdd.length > 0) {
              updates.tags = [...existingSong.tags, ...tagsToAdd];
            }
            if (authorsToAdd.length > 0) {
              updates.authors = [...existingSong.authors, ...authorsToAdd];
            }
            await updateSong(mtSongId, updates);
            if (tagsToAdd.length > 0) {
              console.log(`  Added tags: ${tagsToAdd.join(", ")}`);
            }
            if (authorsToAdd.length > 0) {
              console.log(`  Added authors: ${authorsToAdd.join(", ")}`);
            }
          }
        }
      }

      // Add comment if there are notes
      if (mySong.notes && mySong.notes.trim()) {
        await addComment(mtSongId!, mySong.notes);
        console.log(`  Added comment`);
      }

      // Create version
      const lyrics = readLyrics(mySong);
      const versionId = await createVersion(
        mtSongId!,
        versionLabel,
        mySong.verseOrder,
        lyrics
      );

      // Store IDs
      mySong.musicteam = {
        song_id: mtSongId!,
        song_version_id: versionId,
      };

      // Create media links
      for (const mediaLink of mySong.mediaLinks) {
        const title = getTitleFromUrl(mediaLink.url);
        const mediaId = await createMedia(mtSongId!, versionId, title, mediaLink.url);
        mediaLink.musicteam = { song_media_id: mediaId };
        console.log(`  Added media: ${title}`);
      }

      // Upload sheets
      for (const sheet of mySong.sheets) {
        try {
          const base64Data = readPdfAsBase64(mySong, sheet);
          const objectId = await uploadFile(base64Data);
          const sheetId = await createSheet(mtSongId!, versionId, sheet, objectId);
          sheet.musicteam = { song_sheet_id: sheetId };
          console.log(`  Added sheet: ${sheet.fileName}`);
        } catch (e) {
          console.error(`  Error uploading sheet ${sheet.fileName}: ${e}`);
        }
      }

      // Save progress after each song (allows restart if interrupted)
      writeFileSync(songsPath, JSON.stringify(songsData, null, 2));

      // Delay before next song (if not the last one)
      if (i < mySongs.length - 1 && delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (e) {
      console.error(`${progress} ${mySong.title} - ERROR: ${e}`);
      errors++;
    }
  }

  // Final save
  writeFileSync(songsPath, JSON.stringify(songsData, null, 2));

  console.log();
  console.log("Import complete!");
  console.log(`  Created: ${created}`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Errors: ${errors}`);
  console.log(`\nUpdated: ${songsPath}`);
}

// Run
importSongs().catch((e) => {
  console.error("\nFatal error:", e.message);
  process.exit(1);
});
