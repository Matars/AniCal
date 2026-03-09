# AniCal

![AniCal Banner](media/AkMboS8.png)

A simple Chrome extension to track anime and manga releases.

## Features

- Feed view for today's, tomorrow's, and current season releases
- Calendar view with day-by-day release browsing
- Bookmark your favorite shows
- Quick info modal with description and score

## Tech

- HTML
- CSS
- JavaScript
- Chrome Extension Manifest V3
- Jikan API

## Run Locally

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder (`AniCal`)

## Notes

- Data is fetched from `https://api.jikan.moe/v4`
- Bookmarks are saved with `chrome.storage.sync`
