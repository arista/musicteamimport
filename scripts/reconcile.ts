/**
 * Reconciliation analysis: compare songs.json with musicteam-songs.json
 * and generate reconciliation-issues.md
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

interface Match {
  mySong: MySong;
  mtSong: MusicTeamSong;
  matchType: "ccli" | "title" | "manual";
  issues: string[];
}

interface Unmatched {
  mySong: MySong;
}

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

// Compare arrays (order-insensitive)
function arrayDiff(a: string[], b: string[]): { missing: string[]; extra: string[] } {
  const aLower = a.map(s => s.toLowerCase());
  const bLower = b.map(s => s.toLowerCase());

  const missing = a.filter(item => !bLower.includes(item.toLowerCase()));
  const extra = b.filter(item => !aLower.includes(item.toLowerCase()));

  return { missing, extra };
}

// Main
function reconcile() {
  // Load data
  const songsPath = join(process.cwd(), "data", "songs.json");
  const mtSongsPath = join(process.cwd(), "data", "musicteam-songs.json");

  const songsData = JSON.parse(readFileSync(songsPath, "utf-8"));
  const mtSongsData = JSON.parse(readFileSync(mtSongsPath, "utf-8"));

  const mySongs: MySong[] = songsData.songs;
  const mtSongs: MusicTeamSong[] = mtSongsData.songs;

  console.log(`My songs: ${mySongs.length}`);
  console.log(`MusicTeam songs: ${mtSongs.length}`);
  console.log();

  // Manual matches (found by hand)
  const manualMatches = new Map<string, string>([
    ["More Love, O Christ, To Thee", "s:4d0a81ad-1af4-4647-ae05-eb914b8cc910"],
    ["Silent Night, Holy Night", "s:ecfadeea-f6e8-4b60-bb24-4bbfa6831834"],
    ["The Wise Man Built His House", "s:401749a4-29e1-4d37-95fc-d42438df51ec"],
  ]);

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

  // Reconcile
  const matches: Match[] = [];
  const unmatched: Unmatched[] = [];

  for (const mySong of mySongs) {
    let mtSong: MusicTeamSong | undefined;
    let matchType: "ccli" | "title" | "manual" | undefined;

    // Try manual match first
    const manualId = manualMatches.get(mySong.title);
    if (manualId) {
      mtSong = mtById.get(manualId);
      if (mtSong) matchType = "manual";
    }

    // Try CCLI match
    if (!mtSong && mySong.ccliNumber) {
      mtSong = mtByCcli.get(mySong.ccliNumber);
      if (mtSong) matchType = "ccli";
    }

    // Try title match
    if (!mtSong) {
      mtSong = mtByTitle.get(normalizeTitle(mySong.title));
      if (mtSong) matchType = "title";
    }

    if (mtSong && matchType) {
      // Found a match - check for differences
      const issues: string[] = [];

      // Title difference
      if (mySong.title !== mtSong.title) {
        issues.push(`Title: "${mySong.title}" vs "${mtSong.title}"`);
      }

      // Authors difference
      const authorDiff = arrayDiff(mySong.authors, mtSong.authors);
      if (authorDiff.missing.length > 0) {
        issues.push(`Authors missing from MusicTeam: ${authorDiff.missing.join(", ")}`);
      }
      if (authorDiff.extra.length > 0) {
        issues.push(`Authors in MusicTeam not in mine: ${authorDiff.extra.join(", ")}`);
      }

      // Tags difference - only look for tags we're adding (not in MusicTeam yet)
      const tagDiff = arrayDiff(mySong.tags, mtSong.tags);
      if (tagDiff.missing.length > 0) {
        issues.push(`Tags to add: ${tagDiff.missing.join(", ")}`);
      }

      matches.push({ mySong, mtSong, matchType, issues });
    } else {
      unmatched.push({ mySong });
    }
  }

  // Generate report
  const lines: string[] = [];

  lines.push("# Reconciliation Issues");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| My songs | ${mySongs.length} |`);
  lines.push(`| MusicTeam songs | ${mtSongs.length} |`);
  lines.push(`| Matched by CCLI | ${matches.filter(m => m.matchType === "ccli").length} |`);
  lines.push(`| Matched by title | ${matches.filter(m => m.matchType === "title").length} |`);
  lines.push(`| Matched manually | ${matches.filter(m => m.matchType === "manual").length} |`);
  lines.push(`| Total matched | ${matches.length} |`);
  lines.push(`| Unmatched (new songs) | ${unmatched.length} |`);
  lines.push(`| Matches with issues | ${matches.filter(m => m.issues.length > 0).length} |`);
  lines.push("");

  // Matches with issues
  const matchesWithIssues = matches.filter(m => m.issues.length > 0);
  if (matchesWithIssues.length > 0) {
    lines.push("## Matches with Differences");
    lines.push("");
    lines.push("These songs matched but have differences in metadata:");
    lines.push("");

    for (const match of matchesWithIssues) {
      lines.push(`### ${match.mySong.title}`);
      lines.push("");
      lines.push(`- **Match type**: ${match.matchType}`);
      lines.push(`- **MusicTeam ID**: \`${match.mtSong.id}\``);
      if (match.mySong.ccliNumber) {
        lines.push(`- **CCLI**: ${match.mySong.ccliNumber}`);
      }
      lines.push("");
      lines.push("**Issues:**");
      for (const issue of match.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push("");
    }
  }

  // Perfect matches
  const perfectMatches = matches.filter(m => m.issues.length === 0);
  if (perfectMatches.length > 0) {
    lines.push("## Perfect Matches");
    lines.push("");
    lines.push("These songs matched with no metadata differences:");
    lines.push("");
    lines.push("| My Title | MusicTeam ID | Match Type |");
    lines.push("|----------|--------------|------------|");
    for (const match of perfectMatches) {
      lines.push(`| ${match.mySong.title} | \`${match.mtSong.id}\` | ${match.matchType} |`);
    }
    lines.push("");
  }

  // Unmatched songs
  if (unmatched.length > 0) {
    lines.push("## Unmatched Songs (New)");
    lines.push("");
    lines.push("These songs will be created as new entries in MusicTeam:");
    lines.push("");
    lines.push("| Title | CCLI | Authors |");
    lines.push("|-------|------|---------|");
    for (const u of unmatched) {
      const ccli = u.mySong.ccliNumber || "-";
      const authors = u.mySong.authors.slice(0, 2).join(", ") + (u.mySong.authors.length > 2 ? "..." : "");
      lines.push(`| ${u.mySong.title} | ${ccli} | ${authors} |`);
    }
    lines.push("");
  }

  // Write report
  const reportPath = join(process.cwd(), "data", "reconciliation-issues.md");
  writeFileSync(reportPath, lines.join("\n"));

  // Console summary
  console.log("Reconciliation complete!");
  console.log(`  Matched by CCLI: ${matches.filter(m => m.matchType === "ccli").length}`);
  console.log(`  Matched by title: ${matches.filter(m => m.matchType === "title").length}`);
  console.log(`  Unmatched (new): ${unmatched.length}`);
  console.log(`  With issues: ${matchesWithIssues.length}`);
  console.log(`\nReport: ${reportPath}`);
}

reconcile();
