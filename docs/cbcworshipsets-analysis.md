# cbcWorshipSets Library Analysis

Analysis of the source music library for import planning.

## Directory Structure

```
/cbcWorshipSets
├── /sheets          # 216 song folders (by title)
│   └── /[Song Name]
│       ├── lyrics.txt
│       ├── [song]-[key]-chords.pdf
│       ├── [song]-[key]-lead.pdf
│       └── ...
├── /weekly          # Service files by date
│   ├── cbcWorshipSetSpec-YYYY-MM-DD.js
│   ├── cbcWorshipSet-YYYY-MM-DD.pdf
│   └── cbcWorshipSetLyrics-YYYY-MM-DD.txt
└── /utils           # Generation scripts
```

## File Statistics

| Type | Count | Location |
|------|-------|----------|
| PDF | 774 | sheets + weekly |
| TXT | 481 | lyrics + setlists |
| DOC/DOCX | 219 | chord charts |
| JS | 22 | setlist specs |

## Song Metadata Format

Every song has a `lyrics.txt` with consistent header:

```
Song Title
CCLI Song # 7133494
Artist Name | Composer1 | Composer2
© Copyright holder/year

(verse 1)
Lyrics here...

(chorus)
More lyrics...
```

**Extractable fields:**
- Line 1: Song title
- Line 2: CCLI number (or "Public Domain")
- Line 3: Artists/composers (pipe-separated)
- Line 4: Copyright info
- Remainder: Lyrics with section markers

## PDF Naming Convention

Format: `[songName]-[key]-[type].pdf`

| Component | Examples |
|-----------|----------|
| Key | A, Bb, C, D, E, F, G, Ab |
| Type | chords, lead, vocal, orig, choral |

Examples:
- `blessed-assurance-A-chords.pdf`
- `build-your-kingdom-here-C-leadSheet.pdf`
- `jesusPaidItAll.pdf` (no key/type suffix)

## Setlist Specification Format

JavaScript files define each service:

```javascript
const spec = {
  serviceDate: "2026-02-22",
  headerLines: [
    "Nathan leading musical worship",
    "Doc McLaurin preaching",
  ],
  serviceOrder: [
    { type: "item", line: "Call To Worship" },
    { type: "song", song: "Song 1", songName: "Amazing Grace"},
    { type: "song", song: "Song 2", songName: "How Great Thou Art",
      files: ["specific-file.pdf"]},
  ]
}
```

## Data Quality Issues

| Issue | Count | Impact |
|-------|-------|--------|
| Inconsistent naming | Many | Need normalization |
| Backup files (.txt~) | 15 | Skip on import |
| Git merge conflicts | 6 | Skip on import |
| ODT/XML formats | 5 | Convert or skip |
| Missing metadata | Few | Manual review |

## Mapping to MusicTeam

| cbcWorshipSets | MusicTeam | Notes |
|----------------|-----------|-------|
| Song folder | Song | Title from folder name |
| lyrics.txt line 1 | Song.title | Canonical title |
| lyrics.txt line 2 | Song.ccli_num | Parse number |
| lyrics.txt line 3 | Song.authors[] | Split on pipe |
| lyrics.txt body | SongVersion.lyrics | Strip headers |
| PDF files | SongSheet | One per key/type |
| Key from filename | SongSheet.key | Parse from name |
| Type from filename | SongSheet.type | "Lead Sheet", "Chord Chart" |

## Import Volume

- **216 unique songs** with full metadata
- **~400 PDFs** to upload as sheets
- **22 active setlists** (spec files)
- **150+ historical services** (older format)

## Recommended Extraction Order

1. Parse all `lyrics.txt` files → song metadata JSON
2. Scan PDF files → map to songs with key/type
3. Parse setlist spec files → service definitions
4. Validate and flag anomalies
5. Generate final import JSON
