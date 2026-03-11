/**
 * Generate reconciliation-plan.md based on the reconciliation analysis
 * and manual decisions from reconciliation.md
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Types
interface MySong {
  id: string;
  folderName: string;
  title: string;
  ccliNumber: number | null;
  authors: string[];
  tags: string[];
}

interface MusicTeamSong {
  id: string;
  title: string;
  authors: string[];
  ccliNumber: number | null;
  tags: string[];
}

// Configuration based on reconciliation.md decisions

// These matched songs should become NEW songs instead
const forceNewSongs = new Set([
  "all-creatures-of-our-god-and-king",
  "cornerstone-our-hope-is-built",
  "love-lifted-me-rowe",
]);

// Songs that should have authors added
const addAuthorsFor = new Set([
  "for-your-gift-of-god-the-spirit",
]);

// Song pairs that should become versions of the same MusicTeam song
const versionPairs: { mtSongId: string; versions: { myId: string; label: string }[] }[] = [
  {
    mtSongId: "s:3f21c3d3-5b3f-4d31-8b14-d7d03cc24c07",
    versions: [
      { myId: "celebrate-jesus", label: "From Nathan" },
      { myId: "celebrate-jesus-easier", label: "From Nathan (easier)" },
    ],
  },
  {
    mtSongId: "s:a1f8f058-75ce-4d8f-a9f6-2e0f86ca1c6a",
    versions: [
      { myId: "o-how-i-love-jesus", label: "From Nathan" },
      { myId: "o-how-i-love-jesus-there-is-a-name-i-love-to-hear", label: "From Nathan (hymn 509)" },
    ],
  },
  {
    mtSongId: "s:67df24d4-9397-4682-add6-ca054e4c6d44",
    versions: [
      { myId: "come-thou-long-expected-jesus", label: "From Nathan" },
      { myId: "come-thou-long-expected-jesus-extra-ending", label: "From Nathan (extra ending)" },
    ],
  },
];

// Manual matches
const manualMatches = new Map<string, string>([
  ["More Love, O Christ, To Thee", "s:4d0a81ad-1af4-4647-ae05-eb914b8cc910"],
  ["Silent Night, Holy Night", "s:ecfadeea-f6e8-4b60-bb24-4bbfa6831834"],
  ["The Wise Man Built His House", "s:401749a4-29e1-4d37-95fc-d42438df51ec"],
]);

// Normalize title for comparison
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Plan actions
interface PlanAction {
  mySong: MySong;
  action: "new_song" | "add_version" | "add_version_with_updates";
  mtSongId?: string;
  mtSongTitle?: string;
  versionLabel: string;
  tagsToAdd: string[];
  authorsToAdd: string[];
  notes: string[];
}

function generatePlan() {
  // Load data
  const songsPath = join(process.cwd(), "data", "songs.json");
  const mtSongsPath = join(process.cwd(), "data", "musicteam-songs.json");

  const songsData = JSON.parse(readFileSync(songsPath, "utf-8"));
  const mtSongsData = JSON.parse(readFileSync(mtSongsPath, "utf-8"));

  const mySongs: MySong[] = songsData.songs;
  const mtSongs: MusicTeamSong[] = mtSongsData.songs;

  // Build lookup maps
  const mtByCcli = new Map<number, MusicTeamSong>();
  const mtByTitle = new Map<string, MusicTeamSong>();
  const mtById = new Map<string, MusicTeamSong>();

  for (const song of mtSongs) {
    if (song.ccliNumber) {
      mtByCcli.set(song.ccliNumber, song);
    }
    mtByTitle.set(normalizeTitle(song.title), song);
    mtById.set(song.id, song);
  }

  // Build version pair lookup
  const versionPairLookup = new Map<string, { mtSongId: string; label: string }>();
  for (const pair of versionPairs) {
    for (const v of pair.versions) {
      versionPairLookup.set(v.myId, { mtSongId: pair.mtSongId, label: v.label });
    }
  }

  // Process each song
  const actions: PlanAction[] = [];

  for (const mySong of mySongs) {
    const notes: string[] = [];

    // Check if this is part of a version pair
    const versionPairInfo = versionPairLookup.get(mySong.id);
    if (versionPairInfo) {
      const mtSong = mtById.get(versionPairInfo.mtSongId);
      const tagsToAdd = mySong.tags.filter(
        t => !mtSong?.tags.map(x => x.toLowerCase()).includes(t.toLowerCase())
      );

      actions.push({
        mySong,
        action: "add_version",
        mtSongId: versionPairInfo.mtSongId,
        mtSongTitle: mtSong?.title,
        versionLabel: versionPairInfo.label,
        tagsToAdd,
        authorsToAdd: [],
        notes: ["Part of version pair"],
      });
      continue;
    }

    // Check if forced to be new song
    if (forceNewSongs.has(mySong.id)) {
      actions.push({
        mySong,
        action: "new_song",
        versionLabel: "From Nathan",
        tagsToAdd: [],
        authorsToAdd: [],
        notes: ["Forced to new song (different arrangement)"],
      });
      continue;
    }

    // Try to find a match
    let mtSong: MusicTeamSong | undefined;
    let matchType: string | undefined;

    // Manual match
    const manualId = manualMatches.get(mySong.title);
    if (manualId) {
      mtSong = mtById.get(manualId);
      matchType = "manual";
    }

    // CCLI match
    if (!mtSong && mySong.ccliNumber) {
      mtSong = mtByCcli.get(mySong.ccliNumber);
      if (mtSong) matchType = "ccli";
    }

    // Title match
    if (!mtSong) {
      mtSong = mtByTitle.get(normalizeTitle(mySong.title));
      if (mtSong) matchType = "title";
    }

    if (mtSong) {
      // Matched - add version to existing song
      const tagsToAdd = mySong.tags.filter(
        t => !mtSong!.tags.map(x => x.toLowerCase()).includes(t.toLowerCase())
      );

      let authorsToAdd: string[] = [];
      if (addAuthorsFor.has(mySong.id)) {
        authorsToAdd = mySong.authors.filter(
          a => !mtSong!.authors.map(x => x.toLowerCase()).includes(a.toLowerCase())
        );
      }

      actions.push({
        mySong,
        action: authorsToAdd.length > 0 ? "add_version_with_updates" : "add_version",
        mtSongId: mtSong.id,
        mtSongTitle: mtSong.title,
        versionLabel: "From Nathan",
        tagsToAdd,
        authorsToAdd,
        notes: [`Matched by ${matchType}`],
      });
    } else {
      // No match - create new song
      actions.push({
        mySong,
        action: "new_song",
        versionLabel: "From Nathan",
        tagsToAdd: [],
        authorsToAdd: [],
        notes: [],
      });
    }
  }

  // Generate markdown report
  const lines: string[] = [];

  lines.push("# Reconciliation Plan");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Summary
  const newSongs = actions.filter(a => a.action === "new_song");
  const addVersions = actions.filter(a => a.action === "add_version" || a.action === "add_version_with_updates");
  const withTagUpdates = actions.filter(a => a.tagsToAdd.length > 0);
  const withAuthorUpdates = actions.filter(a => a.authorsToAdd.length > 0);

  lines.push("## Summary");
  lines.push("");
  lines.push("| Action | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Create new song | ${newSongs.length} |`);
  lines.push(`| Add version to existing song | ${addVersions.length} |`);
  lines.push(`| Songs with tags to add | ${withTagUpdates.length} |`);
  lines.push(`| Songs with authors to add | ${withAuthorUpdates.length} |`);
  lines.push("");

  // New songs
  lines.push("## New Songs");
  lines.push("");
  lines.push("These songs will be created as new entries:");
  lines.push("");
  lines.push("| Title | CCLI | Version Label |");
  lines.push("|-------|------|---------------|");
  for (const a of newSongs) {
    const ccli = a.mySong.ccliNumber || "-";
    lines.push(`| ${a.mySong.title} | ${ccli} | ${a.versionLabel} |`);
  }
  lines.push("");

  // Add versions
  lines.push("## Add Versions to Existing Songs");
  lines.push("");
  lines.push("These songs will add a new version to an existing MusicTeam song:");
  lines.push("");

  for (const a of addVersions) {
    lines.push(`### ${a.mySong.title}`);
    lines.push("");
    lines.push(`- **MusicTeam Song**: ${a.mtSongTitle} (\`${a.mtSongId}\`)`);
    lines.push(`- **Version Label**: ${a.versionLabel}`);
    if (a.tagsToAdd.length > 0) {
      lines.push(`- **Tags to add**: ${a.tagsToAdd.join(", ")}`);
    }
    if (a.authorsToAdd.length > 0) {
      lines.push(`- **Authors to add**: ${a.authorsToAdd.join(", ")}`);
    }
    if (a.notes.length > 0) {
      lines.push(`- **Notes**: ${a.notes.join("; ")}`);
    }
    lines.push("");
  }

  // Write report
  const reportPath = join(process.cwd(), "data", "reconciliation-plan.md");
  writeFileSync(reportPath, lines.join("\n"));

  console.log("Plan generated!");
  console.log(`  New songs: ${newSongs.length}`);
  console.log(`  Add versions: ${addVersions.length}`);
  console.log(`  With tag updates: ${withTagUpdates.length}`);
  console.log(`  With author updates: ${withAuthorUpdates.length}`);
  console.log(`\nReport: ${reportPath}`);
}

generatePlan();
