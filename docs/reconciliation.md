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

