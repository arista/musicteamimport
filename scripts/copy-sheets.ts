import { readFileSync, mkdirSync, copyFileSync, existsSync } from "fs";
import { join, dirname } from "path";

// Load config
const configPath = join(process.cwd(), "config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const worshipSetsRoot = config.worshipSetsRoot;

// Load songs.json
const songsPath = join(process.cwd(), "data", "songs.json");
const data = JSON.parse(readFileSync(songsPath, "utf-8"));

const sourceDir = join(worshipSetsRoot, "sheets");
const destDir = join(worshipSetsRoot, "songs-sheets");

let folderCount = 0;
let fileCount = 0;
let skippedCount = 0;

console.log(`Source: ${sourceDir}`);
console.log(`Destination: ${destDir}`);
console.log();

for (const song of data.songs) {
  const songDestDir = join(destDir, song.folderName);

  // Create song folder
  mkdirSync(songDestDir, { recursive: true });
  folderCount++;

  // Copy lyrics file
  if (song.lyricsFile) {
    const srcPath = join(sourceDir, song.folderName, song.lyricsFile);
    const destPath = join(songDestDir, song.lyricsFile);

    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      fileCount++;
    } else {
      console.log(`Missing: ${song.folderName}/${song.lyricsFile}`);
      skippedCount++;
    }
  }

  // Copy sheet files
  for (const sheet of song.sheets) {
    const srcPath = join(sourceDir, song.folderName, sheet.filePath);
    const destPath = join(songDestDir, sheet.filePath);

    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      fileCount++;
    } else {
      console.log(`Missing: ${song.folderName}/${sheet.filePath}`);
      skippedCount++;
    }
  }
}

console.log();
console.log(`Created ${folderCount} folders`);
console.log(`Copied ${fileCount} files`);
if (skippedCount > 0) {
  console.log(`Skipped ${skippedCount} missing files`);
}
console.log(`\nOutput: ${destDir}`);
