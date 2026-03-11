# MusicTeam Data Model

Analysis of the MusicTeam codebase for import planning.

## Tech Stack

- **Backend:** Python 3.13 + AWS Chalice (serverless Lambda REST API)
- **Frontend:** Nuxt 4 (Vue 3) + TypeScript
- **Database:** PostgreSQL (Aurora Serverless)
- **File Storage:** S3 (or MinIO locally)
- **Auth:** Google OAuth + JWT + API keys

## Core Data Model

```
Song
├── SongVersion (1:many)
│   ├── SongSheet (1:many) - PDFs, chord charts
│   └── SongMedia (1:many) - URLs, audio files
└── Tags, Authors (arrays)

Setlist
├── SetlistPosition
└── SetlistSheet → SongSheet
```

## Song Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | TEXT | auto | Format: `s:` + UUID |
| `title` | TEXT | yes | Song title |
| `authors` | TEXT[] | no | Array of author names |
| `ccli_num` | INTEGER | no | CCLI Song ID |
| `tags` | TEXT[] | no | Filterable tags |
| `created_on` | TIMESTAMP | auto | |
| `creator_id` | TEXT | auto | FK to users |
| `last_modified` | TIMESTAMP | auto | |

## SongVersion Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | TEXT | auto | Format: `sv:` + UUID |
| `song_id` | TEXT | yes | FK to song |
| `label` | TEXT | yes | e.g., "Original", "Key of G" |
| `verse_order` | TEXT | no | e.g., "V1 C V2 C B C" |
| `lyrics` | TEXT | no | Full lyrics text |
| `tags` | TEXT[] | no | Version-specific tags |

## SongSheet Fields (PDF attachments)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | TEXT | auto | Format: `ss:` + UUID |
| `song_version_id` | TEXT | yes | FK to version |
| `type` | TEXT | yes | e.g., "Lead Sheet", "Chord Chart" |
| `key` | TEXT | yes | Musical key: "G", "D", "Em" |
| `object_id` | TEXT | yes | UUID of uploaded file |
| `object_type` | TEXT | yes | MIME type: "application/pdf" |
| `tags` | TEXT[] | no | Sheet-specific tags |
| `auto_verse_order` | BOOLEAN | no | Default true; false = sheet includes verse order |

**Notes:**
- **No "primary" sheet concept**: All sheets within a SongVersion are treated equally. There's no designation for a default or primary sheet.
- **auto_verse_order**: When `true` (default), the system auto-determines verse order. When `false`, the sheet itself includes verse order markings. This is the inverse of our `includesVerseOrder` field in songs.json.

## Comments

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | TEXT | auto | Format: `c:` + UUID |
| `resource_id` | TEXT | yes | ID of Song or SongVersion |
| `comment` | TEXT | yes | Comment text |
| `created_on` | TIMESTAMP | auto | |
| `creator_id` | TEXT | yes | FK to users |

**Notes:**
- Comments use a generic `resource_id` field, so they can attach to **either** a Song (`s:...`) or a SongVersion (`sv:...`) based on the ID stored.

## API Endpoints for Import

### Creating a Song (full flow)

**1. Create Song**
```http
POST /songs
{
  "title": "Amazing Grace",
  "authors": ["John Newton"],
  "ccli_num": 26515,
  "tags": ["hymn", "classic"]
}
```

**2. Create Version**
```http
POST /songs/{song_id}/versions
{
  "label": "Original",
  "verse_order": "V1 C V2 C V3 C",
  "lyrics": "Amazing grace, how sweet the sound...",
  "tags": []
}
```

**3. Upload PDF**
```http
POST /objects?base64=false
Content-Type: text/plain
[binary PDF data]

Response: {"id": "uuid-of-uploaded-file"}
```

**4. Create Sheet (link PDF)**
```http
POST /songs/{song_id}/versions/{version_id}/sheets
{
  "type": "Lead Sheet",
  "key": "G",
  "object_id": "uuid-from-step-3",
  "object_type": "application/pdf",
  "tags": [],
  "auto_verse_order": false
}
```
Note: Set `auto_verse_order: false` if the sheet includes verse order markings.

### Other Useful Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/songs` | List all songs |
| GET | `/songs/search?q=text` | Full-text search (lyrics) |
| GET | `/info/tags` | List all tags |
| GET | `/info/authors` | List all authors |

## Authentication

For programmatic access, use API key in header:
```
x-api-key: your-api-key
```

Roles (import needs `leader` or higher):
- `admin` > `manager` > `leader` > `viewer` > `pending` > `inactive`

## Key Import Considerations

1. **Sequential creation required**: Song → Version → (upload file) → Sheet
2. **IDs are auto-generated**: Don't need to supply them
3. **Files uploaded separately**: Upload PDF first, get UUID, then reference in sheet
4. **Tags are flexible**: Can be any strings, stored as arrays
5. **CCLI number optional**: Integer if provided
6. **One version minimum**: Each song needs at least one version to hold lyrics/sheets
7. **Key field required for sheets**: Must specify musical key (e.g., "G", "D")
8. **auto_verse_order is inverted**: Our `includesVerseOrder: true` maps to `auto_verse_order: false`
9. **No primary sheet**: All sheets are equal; our `isPrimary` field is for local review only

## Mapping My Library to MusicTeam

| My Concept | MusicTeam Entity | Notes |
|------------|------------------|-------|
| Song | Song | Title, authors, CCLI |
| Lyrics file | SongVersion.lyrics | Plain text |
| PDF file | SongSheet | Upload to /objects, link via object_id |
| Musical key | SongSheet.key | Required field |
| includesVerseOrder | SongSheet.auto_verse_order | **Inverse**: `includesVerseOrder: true` → `auto_verse_order: false` |
| isPrimary | (none) | No MusicTeam equivalent; for local review only |
| Setlist | Setlist | Can import later |
