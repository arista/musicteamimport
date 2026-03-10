import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "fs";
import { join, basename } from "path";

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
  status: "pending" | "verified" | "flagged" | "skipped" | "imported";
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

// Valid musical keys
const VALID_KEYS = [
  "A", "Bb", "B", "C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab",
  "Am", "Bbm", "Bm", "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "Abm"
];

// Sheet type mappings from filename patterns
const TYPE_PATTERNS: [RegExp, string][] = [
  [/-lead/i, "Lead Sheet"],
  [/-leadSheet/i, "Lead Sheet"],
  [/-vocal/i, "Vocal"],
  [/-choral/i, "Choral"],
  [/-chords/i, "Chord Chart"],
  [/-orig/i, "Original"],
];

// Load config
function loadConfig(): Config {
  const configPath = join(process.cwd(), "config.json");
  const configText = readFileSync(configPath, "utf-8");
  return JSON.parse(configText);
}

// Generate slug ID from folder name
function generateId(folderName: string): string {
  return folderName
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Parse key from filename
function parseKey(fileName: string): string {
  // Remove extension
  const name = fileName.replace(/\.[^.]+$/, "");

  // Try to find a key pattern like "-D-" or "-Bb-" or "-D." or ending with "-D"
  // Also handle patterns like "song-chords-D" or "song-D-chords"
  const parts = name.split(/[-_]/);

  for (const part of parts) {
    // Check if this part is a valid key (case-insensitive match)
    const upperPart = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    if (VALID_KEYS.includes(upperPart)) {
      return upperPart;
    }
    // Handle "Eb", "Bb", etc.
    if (part.length === 2 && VALID_KEYS.includes(part.toUpperCase().charAt(0) + "b")) {
      return part.charAt(0).toUpperCase() + "b";
    }
  }

  return "unknown";
}

// Parse sheet type from filename
function parseSheetType(fileName: string): string {
  for (const [pattern, type] of TYPE_PATTERNS) {
    if (pattern.test(fileName)) {
      return type;
    }
  }
  return "Chord Chart"; // default
}

// Determine if this should be the primary sheet
// Preference: chords > lead > others, non-orig > orig
function calculatePrimaryScore(sheet: Sheet): number {
  let score = 0;

  if (sheet.type === "Chord Chart") score += 100;
  else if (sheet.type === "Lead Sheet") score += 80;
  else if (sheet.type === "Vocal") score += 60;
  else score += 40;

  // Penalize "Original" versions (usually CCLI downloads, less preferred)
  if (sheet.fileName.toLowerCase().includes("-orig")) {
    score -= 20;
  }

  return score;
}

// Parse lyrics.txt header to extract metadata
function parseLyricsFile(filePath: string): {
  title: string;
  ccliNumber: number | null;
  authors: string[];
  copyright: string;
  isPublicDomain: boolean;
  verseOrder: string;
} {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Line 1: Title
  const title = lines[0]?.trim() || "";

  // Line 2: CCLI number - format: "CCLI Song # 1234567"
  let ccliNumber: number | null = null;
  const ccliLine = lines[1]?.trim() || "";
  const ccliMatch = ccliLine.match(/CCLI\s+Song\s*#?\s*(\d+)/i);
  if (ccliMatch) {
    ccliNumber = parseInt(ccliMatch[1], 10);
  }

  // Line 3: Authors - separated by |
  const authorsLine = lines[2]?.trim() || "";
  const authors = authorsLine
    .split("|")
    .map(a => a.trim())
    .filter(a => a.length > 0);

  // Line 4: Copyright
  const copyright = lines[3]?.trim() || "";
  const isPublicDomain = /public\s*domain/i.test(copyright) || /public\s*domain/i.test(ccliLine);

  // Parse verse order from section markers in lyrics
  const verseOrder = parseVerseOrder(content);

  return { title, ccliNumber, authors, copyright, isPublicDomain, verseOrder };
}

// Parse verse order from lyrics content
function parseVerseOrder(content: string): string {
  const sectionPattern = /\((verse\s*\d*|chorus|bridge|pre-?chorus|tag|outro|intro|ending|coda)\)/gi;
  const matches = content.match(sectionPattern) || [];

  const order: string[] = [];
  for (const match of matches) {
    const inner = match.slice(1, -1).toLowerCase(); // remove parens

    if (inner.startsWith("verse")) {
      const num = inner.match(/\d+/)?.[0] || "1";
      order.push(`V${num}`);
    } else if (inner === "chorus") {
      order.push("C");
    } else if (inner === "bridge") {
      order.push("B");
    } else if (inner.includes("prechorus") || inner.includes("pre-chorus")) {
      order.push("P");
    } else if (inner === "tag" || inner === "outro" || inner === "ending" || inner === "coda") {
      order.push("E");
    } else if (inner === "intro") {
      order.push("I");
    }
  }

  return order.join(" ");
}

// Process a single song folder
function processSongFolder(sheetsDir: string, folderName: string, globalNotes: string[]): Song {
  const folderPath = join(sheetsDir, folderName);
  const flags: string[] = [];
  const extractionNotes: string[] = [];

  // Check for lyrics.txt
  const lyricsPath = join(folderPath, "lyrics.txt");
  let title = folderName;
  let ccliNumber: number | null = null;
  let authors: string[] = [];
  let copyright = "";
  let isPublicDomain = false;
  let verseOrder = "";
  let lyricsFile: string | null = null;

  if (existsSync(lyricsPath)) {
    lyricsFile = "lyrics.txt";
    try {
      const parsed = parseLyricsFile(lyricsPath);
      title = parsed.title || folderName;
      ccliNumber = parsed.ccliNumber;
      authors = parsed.authors;
      copyright = parsed.copyright;
      isPublicDomain = parsed.isPublicDomain;
      verseOrder = parsed.verseOrder;

      if (!ccliNumber && !isPublicDomain) {
        flags.push("missing-ccli");
        extractionNotes.push("No CCLI number found and not marked as public domain");
      }
      if (authors.length === 0) {
        flags.push("missing-authors");
        extractionNotes.push("No authors found on line 3 of lyrics.txt");
      }
      if (title !== folderName && title.toLowerCase() !== folderName.toLowerCase()) {
        extractionNotes.push(`Title in lyrics.txt ("${title}") differs from folder name ("${folderName}")`);
      }
    } catch (e) {
      flags.push("parse-error");
      extractionNotes.push(`Error parsing lyrics.txt: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    flags.push("missing-lyrics");
    extractionNotes.push("No lyrics.txt file found in folder");
  }

  // Find all PDF files
  const files = readdirSync(folderPath);
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith(".pdf"));

  // Note any skipped file types
  const skippedFiles = files.filter(f => {
    const lower = f.toLowerCase();
    return !lower.endsWith(".pdf") &&
           !lower.endsWith(".txt") &&
           !lower.endsWith(".doc") &&
           !lower.endsWith(".docx") &&
           !f.startsWith(".");
  });
  if (skippedFiles.length > 0) {
    extractionNotes.push(`Skipped non-standard files: ${skippedFiles.join(", ")}`);
  }

  // Note backup files
  const backupFiles = files.filter(f => f.endsWith("~"));
  if (backupFiles.length > 0) {
    extractionNotes.push(`Found ${backupFiles.length} backup file(s) (ignored)`);
  }

  const sheets: Sheet[] = [];
  for (const fileName of pdfFiles) {
    const filePath = fileName;
    const fullPath = join(folderPath, fileName);
    const stats = statSync(fullPath);
    const key = parseKey(fileName);
    const type = parseSheetType(fileName);

    const sheet: Sheet = {
      filePath,
      fileName,
      key,
      type,
      fileSize: stats.size,
      isPrimary: false, // will be set later
    };

    if (key === "unknown") {
      if (!flags.includes("key-unknown")) {
        flags.push("key-unknown");
      }
      extractionNotes.push(`Could not parse key from filename: ${fileName}`);
    }

    sheets.push(sheet);
  }

  // Determine primary sheet
  if (sheets.length > 0) {
    const scored = sheets.map(s => ({ sheet: s, score: calculatePrimaryScore(s) }));
    scored.sort((a, b) => b.score - a.score);
    scored[0].sheet.isPrimary = true;
  } else {
    flags.push("no-sheets");
    extractionNotes.push("No PDF files found in folder");
  }

  // Deduplicate flags
  const uniqueFlags = [...new Set(flags)];

  return {
    id: generateId(folderName),
    folderName,
    title,
    ccliNumber,
    authors,
    copyright,
    isPublicDomain,
    lyricsFile,
    verseOrder,
    sheets,
    tags: [],
    status: uniqueFlags.length > 0 ? "flagged" : "pending",
    flags: uniqueFlags,
    extractionNotes,
    notes: "",
  };
}

// Main extraction function
function extract() {
  const config = loadConfig();
  const sheetsDir = join(config.worshipSetsRoot, "sheets");
  const extractionNotes: string[] = [];

  console.log(`Extracting songs from: ${sheetsDir}`);

  // Get all song folders
  const allEntries = readdirSync(sheetsDir);
  const folders: string[] = [];
  const skippedEntries: string[] = [];

  for (const name of allEntries) {
    const fullPath = join(sheetsDir, name);
    if (statSync(fullPath).isDirectory()) {
      // Skip merge conflict directories (e.g., "file.pdf" that's actually a directory)
      if (name.endsWith(".pdf") || name.endsWith(".txt")) {
        skippedEntries.push(name);
        extractionNotes.push(`Skipped directory with file extension (likely merge conflict): ${name}`);
      } else {
        folders.push(name);
      }
    }
  }

  console.log(`Found ${folders.length} song folders`);
  if (skippedEntries.length > 0) {
    console.log(`Skipped ${skippedEntries.length} non-song entries`);
  }

  // Process each folder
  const songs: Song[] = [];
  for (const folder of folders) {
    const song = processSongFolder(sheetsDir, folder, extractionNotes);
    songs.push(song);
  }

  // Sort by title
  songs.sort((a, b) => a.title.localeCompare(b.title));

  // Add summary notes
  const flaggedCount = songs.filter(s => s.status === "flagged").length;
  const totalSheets = songs.reduce((sum, s) => sum + s.sheets.length, 0);

  extractionNotes.push(`Extracted ${songs.length} songs with ${totalSheets} sheets`);
  extractionNotes.push(`${flaggedCount} songs flagged for review`);

  // Create output
  const output: SongsJson = {
    extractedAt: new Date().toISOString(),
    songsDir: "sheets",
    songs,
    extractionNotes,
  };

  // Write to file
  const outputPath = join(process.cwd(), "data", "songs.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Summary
  console.log(`\nExtraction complete!`);
  console.log(`  Songs: ${songs.length}`);
  console.log(`  Sheets: ${totalSheets}`);
  console.log(`  Flagged: ${flaggedCount}`);
  console.log(`\nOutput: ${outputPath}`);

  // Show flag summary
  const flagCounts: Record<string, number> = {};
  for (const song of songs) {
    for (const flag of song.flags) {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    }
  }
  if (Object.keys(flagCounts).length > 0) {
    console.log(`\nFlags:`);
    for (const [flag, count] of Object.entries(flagCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${flag}: ${count}`);
    }
  }
}

// Run
extract();
