# Reconciliation

I now have a list of songs and accompanying sheets and lyrics, ready to be uploaded into the site.  However, the existing site already has a set of songs, and I want to avoid creating duplicate songs if possible.

So part of the issue is matching my songs up with what's already in the site.  This can be done by CCLI number, but only for my songs that have a CCLI number.  For songs in my list that don't have a CCLI number, we need to see if there's some song that might match anyway.

Once a song is matched, we need to make sure our song-level metadata is the same.  I think that just comes down to:

* title
* authors
* tags
* comments (would correspond to my "notes" field, I think)
* media attachments (corresponds to my "media links") (although... are those 1:many from the Song, or the SongVersion?)

The other data I have I believe would end up in a SongVersion, which can live separately from a Song and not collide with existing data, I think.

So I think the first step is to see how big the problem is.  And maybe the easiest way to do that is to just download the existing songs from the site.  From there, we can run some analysis.

Given what you know of the musicteam source code, please define a JSON format for extracting the relevant data (id + the above fields), then generate a script for retrieving that data from the live site, which is located at https://musicteam.gutwin.org/ (you won't be able to access it directly).  Have that script accept my musicteam access credentials as environment variables, and write the output to musicteam-songs.json

## Local reconciliation analysis

Given songs.json and musicteam-songs.json, the next step is to look at each song in songs.json.  For each song:

* attempt a match:
    * see if there is an existing song with the same ccli number
    * if not, see if there is a song with the same title (be insensitive to capitalization and punctuation)
* if there is a match:
    * note the musicteam song id
    * look for differences in title
    * look for differences in authors
    * look for differences in tags - look only for tags that we're adding, that aren't yet in musicteam

Also note these matches that have been found by hand:

More Love, O Christ, To Thee - matches "s:4d0a81ad-1af4-4647-ae05-eb914b8cc910"
Silent Night, Holy Night - matches "s:ecfadeea-f6e8-4b60-bb24-4bbfa6831834"
The Wise Man Built His House - matches "s:401749a4-29e1-4d37-95fc-d42438df51ec"


Generate a reconciliation-issues.md file based on the above.

## Reconciliation plan

I've inspected the reconciliation issues by hand, and have the following conclusions:

* Any items matched above (including manual matches) are good matches, with the following exceptions, which should all become new songs instead of matches:
    * my song id "all-creatures-of-our-god-and-king"
    * my song id "cornerstone-our-hope-is-built"
    * my song id "love-lifted-me-rowe"

* For any new songs
    * Use the title, authors, tags, ccli number from my song when creating the new musicteam song
    * If there are any notes in my song, add them as comments to the new song

* For any matched songs
    * Leave the existing title in musicteam
    * If there are any notes in my song, add them as comments to the matched song
    * Add any tags found in mine that aren't in musicteam (note that I've updated songs.json a bit to "massage" some of those tags)
    * Don't modify the authors in musicteam, with the following exceptions:
        * my song id "for-your-gift-of-god-the-spirit", add the authors in mine not found in musicteam

* There are three pairs of songs in my list, in which both songs in the pair should map to the same musicteam song and become two SongVersions of that song, each with a different Version Label:
    * Musicteam song "s:3f21c3d3-5b3f-4d31-8b14-d7d03cc24c07"
        * my "celebrate-jesus" - Version Label "From Nathan"
        * my "celebrate-jesus-easier" - Version Label "From Nathan (easier)"
    * Musicteam song "s:a1f8f058-75ce-4d8f-a9f6-2e0f86ca1c6a"
        * my "o-how-i-love-jesus" - Version Label "From Nathan"
        * my "o-how-i-love-jesus-there-is-a-name-i-love-to-hear" - Version Label "From Nathan (hymn 509)"
    * Musicteam song "s:67df24d4-9397-4682-add6-ca054e4c6d44"
        * my "come-thou-long-expected-jesus" - Version Label "From Nathan"
        * my "come-thou-long-expected-jesus-extra-ending" - Version Label "From Nathan (extra ending)"

Based on all this, please come up with a data/reconciliation-plan.md which describes what will be done for each song in my library.


## Importing

For each song in my library:

* Find or create the corresponding musicteam Song, updating or populating with metadata, and adding comments, according to the above reconciliation rules
    * If a matched Song was expected but not found, just treat it as a new Song (I might be running this against a local version to try it out)
* Create a new SongVersion for that Song
    * set the label to "From Nathan" (unless explicitly specified in the above reconciliation notes)
    * set the verse order and lyrics
    * for each mediaLinks:
        * add a musicteam media link, with title derived from the domain of the link (e.g., "YouTube")
        * add `musicteam: {song_media_id: ...}` to the media link
* Upload files that will become sheets
* Create new SongSheet items for those files
    * Set the type to our sheet's "type" or "typeOther" (I don't think we have any typeOthers?)
    * Set auto_verse_order to the inverse of our includesVerseOrder
    * For the one marked primary on ours, add tag "primary"
* In my songs.json:
    * For each song, add `musicteam: {song_id: ..., song_version_id: ...}`
    * For each sheet add `musicteam: {song_sheet_id: ...}`

Note that the target site might get overwhelmed quickly.  Add a mandatory "delay" CLI argument, specified in seconds, which waits that long between importing each song.

Update the songs.json file after every song.  Use the presence of the "musicteam" properties as an indicator for which songs still need to be processed.  Hopefully this will let the script be restarted if interrupted.
