# Project Analysis: MusicTeam Import

## Initial Thoughts

This is a data migration and integration project with a clear scope: import a personal worship music library into an existing web application (MusicTeam). The project has well-defined phases and realistic expectations.

## What I Like About This Approach

1. **Incremental verification** - Building a local webapp to verify the data before upload is smart. Catching errors early prevents messy cleanup later.

2. **Reconciliation step** - Checking for duplicates against existing MusicTeam data before uploading avoids creating duplicate entries.

3. **Staged uploads** - Testing against a local instance first, then small batches to production, is a safe approach.

4. **Clear boundaries** - The note about not modifying source directories (cbcWorshipSets, musicteam) keeps things clean.

## Key Questions to Investigate

### About MusicTeam
- What's the data model? (songs, artists, tags, setlists, attachments?)
- What's the API for uploading? REST? GraphQL?
- Are there import/export features already built in?
- What file types are supported for attachments?

### About the Music Library (cbcWorshipSets)
- How is it organized? (folders by artist? by date? by category?)
- What formats are the files? (PDF, lyrics as .txt, .docx, ChordPro?)
- Where is metadata stored? (in filenames? in a database? in file contents?)
- How are setlists represented? (folders? text files listing songs?)
- What are CCLI numbers and where are they stored?

## Suggested First Steps

1. **Explore MusicTeam codebase** - Find the data models, understand what fields exist for songs, what relationships exist (tags, setlists, etc.), and what the upload mechanism looks like.

2. **Explore cbcWorshipSets** - Get a sense of the directory structure, file types, naming conventions, and how metadata is currently embedded.

3. **Create a mapping document** - Once both are understood, document how concepts in the personal library should map to MusicTeam's model.

## Potential Challenges

- **CCLI extraction** - Extracting CCLI numbers from PDFs or file contents may require parsing/OCR
- **Deduplication** - Songs might exist under slightly different names or with different arrangements
- **File format consistency** - The personal library may have evolved over years with inconsistent naming/organization
- **Rate limiting** - The note about production being easily overloaded suggests careful throttling will be needed

## Ready to Start

When you're ready, I can begin by exploring either:
- The **MusicTeam** codebase to understand its data model and API
- The **cbcWorshipSets** directory to understand the source data structure

Which would you prefer I start with?
