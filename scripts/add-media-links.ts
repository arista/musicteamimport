import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Load config
const configPath = join(process.cwd(), "config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const worshipSetsRoot = config.worshipSetsRoot;

// Load songs.json
const songsPath = join(process.cwd(), "data", "songs.json");
const data = JSON.parse(readFileSync(songsPath, "utf-8"));

const urlPattern = /https?:\/\/[^\s<>")\]]+/gi;

let addedCount = 0;

for (const song of data.songs) {
  if (!song.lyricsFile) {
    song.mediaLinks = [];
    continue;
  }

  const lyricsPath = join(worshipSetsRoot, "sheets", song.folderName, song.lyricsFile);

  if (!existsSync(lyricsPath)) {
    song.mediaLinks = [];
    continue;
  }

  try {
    const content = readFileSync(lyricsPath, "utf-8");
    const matches = content.match(urlPattern) || [];
    song.mediaLinks = [...new Set(matches)]; // dedupe

    if (song.mediaLinks.length > 0) {
      console.log(`${song.title}: ${song.mediaLinks.join(", ")}`);
      addedCount++;
    }
  } catch (e) {
    song.mediaLinks = [];
  }
}

// Write updated songs.json
writeFileSync(songsPath, JSON.stringify(data, null, 2));

console.log(`\nAdded media links to ${addedCount} songs`);
