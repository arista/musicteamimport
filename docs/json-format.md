# Import JSON Format

This document defines the JSON format for extracted song data.

## Overview

Two main files:
- `songs.json` - All songs with metadata and file references
- `setlists.json` - Service setlists (optional, phase 2)

## Configuration

The root path to cbcWorshipSets is configured separately (environment variable, config file, or CLI argument) and not stored in the JSON. All paths in the JSON are relative to this root.

```
# Example: config.json or environment variable
WORSHIP_SETS_ROOT=/claude-repos/cbcWorshipSets
```

## songs.json

```json
{
  "extractedAt": "2026-03-10T12:00:00Z",
  "songsDir": "sheets",
  "songs": [
    {
      "id": "amazing-grace-my-chains-are-gone",
      "folderName": "Amazing Grace (My Chains Are Gone)",
      "title": "Amazing Grace (My Chains Are Gone)",
      "ccliNumber": 4768151,
      "authors": ["John Newton", "Chris Tomlin", "Louie Giglio"],
      "copyright": "© 2006 worshiptogether.com songs",
      "isPublicDomain": false,

      "lyricsFile": "lyrics.txt",
      "verseOrder": "V1 C V2 C V3 C",

      "sheets": [
        {
          "filePath": "amazing-grace-my-chains-are-gone-D.pdf",
          "fileName": "amazing-grace-my-chains-are-gone-D.pdf",
          "key": "D",
          "type": "Chord Chart",
          "fileSize": 45678,
          "isPrimary": true
        },
        {
          "filePath": "amazing-grace-my-chains-are-gone-D-orig.pdf",
          "fileName": "amazing-grace-my-chains-are-gone-D-orig.pdf",
          "key": "D",
          "type": "Original",
          "fileSize": 52341,
          "isPrimary": false
        }
      ],

      "tags": [],

      "status": "pending",
      "flags": [],
      "notes": ""
    }
  ]
}
```

## Field Definitions

### Song Level

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| `id` | string | yes | generated | Slug from folder name |
| `folderName` | string | yes | filesystem | Original folder name |
| `title` | string | yes | lyrics.txt line 1 | Canonical title |
| `ccliNumber` | number\|null | no | lyrics.txt line 2 | Parsed integer |
| `authors` | string[] | yes | lyrics.txt line 3 | Split on ` \| ` |
| `copyright` | string | no | lyrics.txt line 4 | Raw copyright line |
| `isPublicDomain` | boolean | yes | lyrics.txt | True if "Public Domain" |
| `tags` | string[] | no | user-assigned | For categorization |
| `lyricsFile` | string | yes | filesystem | Filename, relative to folderName |
| `verseOrder` | string | no | parsed | e.g., "V1 C V2 C B" |
| `status` | string | yes | workflow | See status values |
| `flags` | string[] | no | extraction | Issues found |
| `extractionNotes` | string[] | no | extraction | Detailed notes from extraction |
| `notes` | string | no | user | Manual notes |

### Sheet Level

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| `filePath` | string | yes | filesystem | Filename, relative to folderName |
| `fileName` | string | yes | filesystem | Just filename |
| `key` | string | yes | parsed | Musical key from filename |
| `type` | string | yes | parsed | Sheet type from filename |
| `fileSize` | number | yes | filesystem | Bytes |
| `isPrimary` | boolean | yes | algorithm | Preferred version |

### Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Not yet reviewed |
| `verified` | Reviewed and approved |
| `flagged` | Has issues needing attention |
| `skipped` | Intentionally excluded |
| `imported` | Successfully uploaded |

### Flag Values

| Flag | Meaning |
|------|---------|
| `missing-ccli` | No CCLI number found |
| `missing-authors` | No authors found |
| `missing-lyrics` | No lyrics.txt file |
| `no-sheets` | No PDF files found |
| `parse-error` | Error parsing metadata |
| `duplicate-suspected` | May duplicate existing song |
| `key-unknown` | Could not parse key from filename |

## Sheet Type Mapping

Extracted from filename → MusicTeam type:

| Filename contains | MusicTeam type |
|-------------------|----------------|
| `-chords` | "Chord Chart" |
| `-lead` | "Lead Sheet" |
| `-vocal` | "Vocal" |
| `-choral` | "Choral" |
| `-orig` | "Original" |
| (none/default) | "Chord Chart" |

## Key Parsing

Extract from filename patterns:
- `song-D.pdf` → "D"
- `song-chords-Eb.pdf` → "Eb"
- `song-A-lead.pdf` → "A"

Valid keys: `A, Bb, B, C, C#, Db, D, Eb, E, F, F#, Gb, G, Ab`
Also: `Am, Bm, Cm, Dm, Em, Fm, Gm` (minor keys)

## Example: Full Song Entry

```json
{
  "id": "how-great-thou-art",
  "folderName": "How Great Thou Art",
  "title": "How Great Thou Art",
  "ccliNumber": 14181,
  "authors": ["Stuart K. Hine"],
  "copyright": "© 1949 Stuart Hine Trust",
  "isPublicDomain": false,

  "lyricsFile": "lyrics.txt",
  "verseOrder": "V1 C V2 C V3 C V4 C",

  "sheets": [
    {
      "filePath": "how-great-thou-art-Bb.pdf",
      "fileName": "how-great-thou-art-Bb.pdf",
      "key": "Bb",
      "type": "Chord Chart",
      "fileSize": 48291,
      "isPrimary": true
    }
  ],

  "tags": ["hymn", "classic"],
  "status": "pending",
  "flags": [],
  "notes": ""
}
```

## setlists.json (Phase 2)

```json
{
  "extractedAt": "2026-03-10T12:00:00Z",
  "setlists": [
    {
      "id": "2026-02-22",
      "serviceDate": "2026-02-22",
      "title": "Sunday Worship - February 22, 2026",
      "leader": "Nathan",
      "preacher": "Doc McLaurin",
      "songs": [
        {
          "position": 1,
          "songId": "amazing-grace-my-chains-are-gone",
          "label": "Song 1"
        },
        {
          "position": 2,
          "songId": "how-great-thou-art",
          "label": "Song 2"
        }
      ],
      "status": "pending"
    }
  ]
}
```

## File Locations

```
/musicteamimport/
├── config.json             # Configuration (paths, etc.)
├── data/
│   ├── songs.json          # Extracted song data
│   ├── setlists.json       # Extracted setlists
│   └── reconciliation.json # Comparison with existing MusicTeam data
├── docs/
│   └── json-format.md      # This file
└── scripts/
    └── extract.ts          # Extraction script
```

## config.json

```json
{
  "worshipSetsRoot": "/claude-repos/cbcWorshipSets"
}
```

File paths resolve as: `{worshipSetsRoot}/sheets/{folderName}/{filePath}`

For example:
- `folderName: "How Great Thou Art"`, `lyricsFile: "lyrics.txt"`
- Resolves to: `/claude-repos/cbcWorshipSets/sheets/How Great Thou Art/lyrics.txt`
