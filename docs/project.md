# MusicTeam Import

## Background

I am one of two worship leaders at a small church.  Over the years I've built up a collection of music that I've used as PDF and lyrics files.  Those are stored as individual songs, and I also have built up a collection of the set lists that I've used over the years.  All of that can be found in ../cbcWorshipSets.  I'll describe that later.

Our other worship leader (Karl) has his own similar set of music.  Over time, we've realized that if we're going to start bringing in other worship leaders, we need to standardize the way we catalog and select music.

We're aware that there are commercial solutions out there (Planning Center, for example).  But for whatever reason, we haven't really gotten much momentum to try that out.

Karl, meanwhile, built a web app to take this on.  It's called MusicTeam, and the latest source code is at ../musicteam.  He's already uploaded all his music.  So my task is to do the same and import my music library.

## Music Import Steps

Here are the broad steps as I see them:

* Analyze musicteam to see what model it expects
    * See how those concepts map to how I would interpret them for how I use my music, choose what tags I would apply, etc.
* Analyze my music library
    * Extract metadata - CCLI numbers
    * Look for anomalies, correct or clarify if feasible
    * Normalize things where appropriate
    * Come up with a JSON file or set of JSON files that 
* Write a small webapp that lets me look at the results and verify them
    * The app lets me quickly go through the list of music
    * I can quickly view files text and pdf files, maybe even just by hovering, and use that to verify
    * I can make adjustments as necessary, and have those be written back to the JSON files
    * Ultimately, the goal is to end up with JSON files containing the data (and pointersto files) that I want to upload
* Reconcile against the existing musicteam app
    * See if there are uploads of songs or other data items that are already in the app, vs. what are new items to be added
* Prepare to upload
    * Do this against a local instance first
    * Do a couple tests to make sure the uploads work correctly (that I have my API key working correctly, etc.)
    * Do a couple tests against the live instance
    * Upload all the rest
        * Do this in slower stages - apparently the production code can get overloaded easily

Where I hope that Claude Code can help:

* Look at musicteam and see what it expects for its model, and take a guess at how those model elements are intended to be used
* Work with me to understand how my own music library is structured, what data can be found there, etc.
* Work with me to understand how my music library's concepts should translate to musicteam's model
* Work with me to define the final JSON format for the data
* Take a crack at analyzing the existing music and populate that data
* "Vibe-code" a web app that lets me verify the music.  The web app would run locally, and would have access to my music library and the JSON files to be edited
* Help me come up with the process for reconciling my data and the resulting JSON files for final upload

NOTE - although claude will have access to those other directories, it should not modify anything in those directories.  Any work it does should be put into this repo.

