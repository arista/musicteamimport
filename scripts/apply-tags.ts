import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

// Types
interface Config {
  worshipSetsRoot: string;
}

interface Sheet {
  filePath: string;
  fileName: string;
  key: string;
  type: string;
  fileSize: number;
  isPrimary: boolean;
}

interface Song {
  id: string;
  folderName: string;
  title: string;
  ccliNumber: number | null;
  authors: string[];
  copyright: string;
  isPublicDomain: boolean;
  lyricsFile: string | null;
  verseOrder: string;
  sheets: Sheet[];
  tags: string[];
  status: string;
  flags: string[];
  extractionNotes: string[];
  notes: string;
}

interface SongsJson {
  extractedAt: string;
  songsDir: string;
  songs: Song[];
  extractionNotes: string[];
}

interface ServiceSong {
  songName: string;
  role: string; // "Song 1", "Children's Song", "Closing Song", etc.
}

interface Service {
  date: string;
  songs: ServiceSong[];
}

// Liturgical date calculations
function getEasterDate(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getLiturgicalTag(dateStr: string): string | null {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  const easter = getEasterDate(year);

  // Helper to get days difference
  const daysDiff = (d1: Date, d2: Date) => {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((d1.getTime() - d2.getTime()) / msPerDay);
  };

  const daysFromEaster = daysDiff(date, easter);

  // Palm Sunday: 7 days before Easter
  if (daysFromEaster >= -7 && daysFromEaster <= -7) {
    return "palm-sunday";
  }

  // Good Friday: 2 days before Easter
  if (daysFromEaster >= -2 && daysFromEaster <= -2) {
    return "good-friday";
  }

  // Easter: Easter Sunday
  if (daysFromEaster >= 0 && daysFromEaster <= 0) {
    return "easter";
  }

  // Pentecost: 49 days after Easter
  if (daysFromEaster >= 49 && daysFromEaster <= 49) {
    return "pentecost";
  }

  // Christmas: Dec 24-25
  if (month === 11 && (day === 24 || day === 25)) {
    return "christmas";
  }

  // Advent: 4 Sundays before Christmas (roughly Nov 27 - Dec 24)
  // Simplified: Dec 1-23 or last week of November
  if ((month === 11 && day < 24) || (month === 10 && day >= 27)) {
    return "advent";
  }

  // Epiphany: Jan 6 (or first Sunday in January after Jan 1)
  if (month === 0 && day >= 2 && day <= 8) {
    return "epiphany";
  }

  return null;
}

// Parse a lyrics file to extract song list
function parseSetlistLyrics(filePath: string): ServiceSong[] {
  const content = readFileSync(filePath, "utf-8");
  const songs: ServiceSong[] = [];

  // Pattern: "** Song 1 - Title" or "** Children's Song - Title" etc.
  const songPattern = /^\*\*\s*(Song \d+|Children'?s Song|Closing Song|Opening Song)\s*[-–—]\s*(.+)$/gm;

  let match;
  while ((match = songPattern.exec(content)) !== null) {
    songs.push({
      role: match[1],
      songName: match[2].trim(),
    });
  }

  return songs;
}

// Normalize song name for matching
function normalizeSongName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^a-z0-9' ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Find matching song in library
function findSong(songs: Song[], songName: string): Song | null {
  const normalized = normalizeSongName(songName);

  // Try exact match on title
  for (const song of songs) {
    if (normalizeSongName(song.title) === normalized) {
      return song;
    }
  }

  // Try exact match on folder name
  for (const song of songs) {
    if (normalizeSongName(song.folderName) === normalized) {
      return song;
    }
  }

  // Try partial match (song name contains or is contained by)
  for (const song of songs) {
    const normalizedTitle = normalizeSongName(song.title);
    const normalizedFolder = normalizeSongName(song.folderName);
    if (
      normalizedTitle.includes(normalized) ||
      normalized.includes(normalizedTitle) ||
      normalizedFolder.includes(normalized) ||
      normalized.includes(normalizedFolder)
    ) {
      return song;
    }
  }

  return null;
}

// Load config
function loadConfig(): Config {
  const configPath = join(process.cwd(), "config.json");
  const configText = readFileSync(configPath, "utf-8");
  return JSON.parse(configText);
}

// Main tagging function
function applyTags() {
  const config = loadConfig();
  const weeklyDir = join(config.worshipSetsRoot, "weekly");

  // Load songs.json
  const songsPath = join(process.cwd(), "data", "songs.json");
  const songsJson: SongsJson = JSON.parse(readFileSync(songsPath, "utf-8"));
  const songs = songsJson.songs;

  console.log(`Loaded ${songs.length} songs`);

  // Track tag applications
  const tagCounts: Record<string, number> = {};
  const unmatchedSongs: string[] = [];

  // Find all setlist lyrics files
  const files = readdirSync(weeklyDir);
  const lyricsFiles = files.filter((f) =>
    f.match(/^cbcWorshipSetLyrics-\d{4}-\d{2}-\d{2}.*\.txt$/)
  );

  console.log(`Found ${lyricsFiles.length} setlist files`);

  // Process each setlist
  for (const file of lyricsFiles) {
    // Extract date from filename
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;

    const dateStr = dateMatch[1];
    const filePath = join(weeklyDir, file);

    // Get liturgical tag for this date
    const liturgicalTag = getLiturgicalTag(dateStr);

    // Parse songs from setlist
    const serviceSongs = parseSetlistLyrics(filePath);

    for (const serviceSong of serviceSongs) {
      const song = findSong(songs, serviceSong.songName);

      if (!song) {
        if (!unmatchedSongs.includes(serviceSong.songName)) {
          unmatchedSongs.push(serviceSong.songName);
        }
        continue;
      }

      // Apply kids tag for children's songs
      if (serviceSong.role.toLowerCase().includes("children")) {
        if (!song.tags.includes("kids")) {
          song.tags.push("kids");
          tagCounts["kids"] = (tagCounts["kids"] || 0) + 1;
        }
      }

      // Apply liturgical tag if applicable
      if (liturgicalTag && !song.tags.includes(liturgicalTag)) {
        song.tags.push(liturgicalTag);
        tagCounts[liturgicalTag] = (tagCounts[liturgicalTag] || 0) + 1;
      }
    }
  }

  // Sort tags in each song
  for (const song of songs) {
    song.tags.sort();
  }

  // Update extraction notes
  songsJson.extractionNotes.push(
    `Applied tags from ${lyricsFiles.length} setlist files`
  );
  if (unmatchedSongs.length > 0) {
    songsJson.extractionNotes.push(
      `${unmatchedSongs.length} songs from setlists could not be matched`
    );
  }

  // Write updated songs.json
  writeFileSync(songsPath, JSON.stringify(songsJson, null, 2));

  // Write unmatched songs to separate file
  if (unmatchedSongs.length > 0) {
    const unmatchedPath = join(process.cwd(), "data", "unmatched-songs.txt");
    const unmatchedContent = [
      "# Songs referenced in setlists but not found in library",
      `# Generated: ${new Date().toISOString()}`,
      `# Count: ${unmatchedSongs.length}`,
      "",
      ...unmatchedSongs.sort(),
    ].join("\n");
    writeFileSync(unmatchedPath, unmatchedContent);
  }

  // Summary
  console.log(`\nTagging complete!`);
  console.log(`\nTags applied:`);
  for (const [tag, count] of Object.entries(tagCounts).sort()) {
    console.log(`  ${tag}: ${count}`);
  }

  if (unmatchedSongs.length > 0) {
    console.log(`\nUnmatched songs from setlists (${unmatchedSongs.length}):`);
    for (const name of unmatchedSongs.slice(0, 10)) {
      console.log(`  - ${name}`);
    }
    if (unmatchedSongs.length > 10) {
      console.log(`  ... and ${unmatchedSongs.length - 10} more`);
    }
  }
}

// Run
applyTags();
