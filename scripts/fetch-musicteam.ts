/**
 * Fetch existing songs from MusicTeam for reconciliation.
 *
 * Environment variables:
 *   MUSICTEAM_API_URL - Base URL (default: https://musicteam.gutwin.org)
 *   MUSICTEAM_API_KEY - API key for authentication
 *
 * Output: data/musicteam-songs.json
 */

import { writeFileSync } from "fs";
import { join } from "path";

// Types matching MusicTeam API
interface MusicTeamSong {
  id: string;
  title: string;
  authors: string[];
  ccli_num: number | null;
  tags: string[];
  created_on: string;
  creator_id: string;
  last_modified: string;
}

interface MusicTeamVersion {
  id: string;
  song_id: string;
  label: string;
  verse_order: string | null;
  lyrics: string | null;
  tags: string[];
  created_on: string;
  creator_id: string;
}

interface MusicTeamMedia {
  id: string;
  song_version_id: string;
  title: string;
  url: string | null;
  object_id: string | null;
  media_type: string | null;
  tags: string[];
}

// Output format
interface OutputSong {
  id: string;
  title: string;
  authors: string[];
  ccliNumber: number | null;
  tags: string[];
  versions: {
    id: string;
    label: string;
    tags: string[];
    media: {
      id: string;
      title: string;
      url: string | null;
    }[];
  }[];
}

interface OutputJson {
  extractedAt: string;
  source: string;
  songs: OutputSong[];
}

// Config from environment
const API_URL = process.env.MUSICTEAM_API_URL || "https://musicteam.gutwin.org";
const API_KEY = process.env.MUSICTEAM_API_KEY;

if (!API_KEY) {
  console.error("Error: MUSICTEAM_API_KEY environment variable is required");
  console.error("Usage: MUSICTEAM_API_KEY=your-key npm run fetch-musicteam");
  process.exit(1);
}

// Fetch helper
async function apiFetch<T>(endpoint: string): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": API_KEY!,
    },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText} for ${endpoint}`);
  }

  return res.json();
}

// Main extraction
async function fetchMusicTeam() {
  console.log(`Fetching from: ${API_URL}`);
  console.log();

  // Fetch all songs
  console.log("Fetching songs...");
  const songsResponse = await apiFetch<{ songs: MusicTeamSong[] }>("/songs");
  const songs = songsResponse.songs;
  console.log(`Found ${songs.length} songs`);

  const outputSongs: OutputSong[] = [];

  // Fetch versions and media for each song
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    process.stdout.write(`\rProcessing ${i + 1}/${songs.length}: ${song.title.substring(0, 40).padEnd(40)}`);

    const outputSong: OutputSong = {
      id: song.id,
      title: song.title,
      authors: song.authors,
      ccliNumber: song.ccli_num,
      tags: song.tags,
      versions: [],
    };

    try {
      // Fetch versions
      const versionsResponse = await apiFetch<{ song_versions: MusicTeamVersion[] }>(
        `/songs/${song.id}/versions`
      );

      for (const version of versionsResponse.song_versions) {
        const outputVersion = {
          id: version.id,
          label: version.label,
          tags: version.tags,
          media: [] as { id: string; title: string; url: string | null }[],
        };

        // Fetch media for this version
        try {
          const mediaResponse = await apiFetch<{ song_media: MusicTeamMedia[] }>(
            `/songs/${song.id}/versions/${version.id}/media`
          );

          for (const media of mediaResponse.song_media) {
            outputVersion.media.push({
              id: media.id,
              title: media.title,
              url: media.url,
            });
          }
        } catch (e) {
          // No media or error fetching - continue
        }

        outputSong.versions.push(outputVersion);
      }
    } catch (e) {
      // No versions or error fetching - continue
    }

    outputSongs.push(outputSong);
  }

  console.log("\n");

  // Sort by title
  outputSongs.sort((a, b) => a.title.localeCompare(b.title));

  // Create output
  const output: OutputJson = {
    extractedAt: new Date().toISOString(),
    source: API_URL,
    songs: outputSongs,
  };

  // Write to file
  const outputPath = join(process.cwd(), "data", "musicteam-songs.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Summary
  const totalVersions = outputSongs.reduce((sum, s) => sum + s.versions.length, 0);
  const totalMedia = outputSongs.reduce(
    (sum, s) => sum + s.versions.reduce((vsum, v) => vsum + v.media.length, 0),
    0
  );
  const withCcli = outputSongs.filter(s => s.ccliNumber).length;

  console.log("Extraction complete!");
  console.log(`  Songs: ${outputSongs.length}`);
  console.log(`  Versions: ${totalVersions}`);
  console.log(`  Media items: ${totalMedia}`);
  console.log(`  With CCLI: ${withCcli}`);
  console.log(`\nOutput: ${outputPath}`);
}

// Run
fetchMusicTeam().catch((e) => {
  console.error("\nError:", e.message);
  process.exit(1);
});
