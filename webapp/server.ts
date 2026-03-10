import express from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Load config
const configPath = join(__dirname, "..", "config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const worshipSetsRoot = config.worshipSetsRoot;

// Paths
const songsJsonPath = join(__dirname, "..", "data", "songs.json");
const publicDir = join(__dirname, "public");

// Middleware
app.use(express.json());
app.use(express.static(publicDir));

// API: Get all songs
app.get("/api/songs", (req, res) => {
  const data = JSON.parse(readFileSync(songsJsonPath, "utf-8"));
  res.json(data);
});

// API: Update a song
app.put("/api/songs/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const data = JSON.parse(readFileSync(songsJsonPath, "utf-8"));
  const songIndex = data.songs.findIndex((s: any) => s.id === id);

  if (songIndex === -1) {
    return res.status(404).json({ error: "Song not found" });
  }

  // Update allowed fields
  const allowedFields = ["title", "authors", "ccliNumber", "tags", "status", "notes", "verseOrder"];
  for (const field of allowedFields) {
    if (field in updates) {
      data.songs[songIndex][field] = updates[field];
    }
  }

  writeFileSync(songsJsonPath, JSON.stringify(data, null, 2));
  res.json(data.songs[songIndex]);
});

// API: Bulk update status
app.post("/api/songs/bulk-status", (req, res) => {
  const { ids, status } = req.body;

  const data = JSON.parse(readFileSync(songsJsonPath, "utf-8"));
  let updated = 0;

  for (const id of ids) {
    const song = data.songs.find((s: any) => s.id === id);
    if (song) {
      song.status = status;
      updated++;
    }
  }

  writeFileSync(songsJsonPath, JSON.stringify(data, null, 2));
  res.json({ updated });
});

// API: Get lyrics file content
app.get("/api/lyrics/:folderName", (req, res) => {
  const { folderName } = req.params;
  const lyricsPath = join(worshipSetsRoot, "sheets", folderName, "lyrics.txt");

  if (!existsSync(lyricsPath)) {
    return res.status(404).json({ error: "Lyrics file not found" });
  }

  const content = readFileSync(lyricsPath, "utf-8");
  res.type("text/plain").send(content);
});

// API: Serve PDF files
app.get("/api/pdf/:folderName/:fileName", (req, res) => {
  const { folderName, fileName } = req.params;
  const pdfPath = join(worshipSetsRoot, "sheets", folderName, fileName);

  if (!existsSync(pdfPath)) {
    return res.status(404).json({ error: "PDF not found" });
  }

  res.sendFile(pdfPath);
});

// API: Get stats
app.get("/api/stats", (req, res) => {
  const data = JSON.parse(readFileSync(songsJsonPath, "utf-8"));
  const songs = data.songs;

  const stats = {
    total: songs.length,
    pending: songs.filter((s: any) => s.status === "pending").length,
    verified: songs.filter((s: any) => s.status === "verified").length,
    flagged: songs.filter((s: any) => s.status === "flagged").length,
    skipped: songs.filter((s: any) => s.status === "skipped").length,
  };

  res.json(stats);
});

// API: Get all unique tags
app.get("/api/tags", (req, res) => {
  const data = JSON.parse(readFileSync(songsJsonPath, "utf-8"));
  const allTags = new Set<string>();

  for (const song of data.songs) {
    for (const tag of song.tags) {
      allTags.add(tag);
    }
  }

  res.json([...allTags].sort());
});

// API: Update a sheet
app.put("/api/songs/:songId/sheets/:sheetIndex", (req, res) => {
  const { songId, sheetIndex } = req.params;
  const updates = req.body;
  const index = parseInt(sheetIndex, 10);

  const data = JSON.parse(readFileSync(songsJsonPath, "utf-8"));
  const song = data.songs.find((s: any) => s.id === songId);

  if (!song) {
    return res.status(404).json({ error: "Song not found" });
  }

  if (index < 0 || index >= song.sheets.length) {
    return res.status(404).json({ error: "Sheet not found" });
  }

  // Update allowed fields
  const allowedFields = ["key", "type", "typeOther", "includesVerseOrder"];
  for (const field of allowedFields) {
    if (field in updates) {
      song.sheets[index][field] = updates[field];
    }
  }

  // Handle isPrimary separately - only one can be primary
  if (updates.isPrimary === true) {
    for (let i = 0; i < song.sheets.length; i++) {
      song.sheets[i].isPrimary = (i === index);
    }
  }

  writeFileSync(songsJsonPath, JSON.stringify(data, null, 2));
  res.json(song);
});

app.listen(PORT, () => {
  console.log(`Verification webapp running at http://localhost:${PORT}`);
  console.log(`Songs JSON: ${songsJsonPath}`);
  console.log(`Worship sets: ${worshipSetsRoot}`);
});
