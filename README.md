# Overleaf Comment Exporter

A Chrome extension to load, select, and export comments from [Overleaf](https://www.overleaf.com) projects, with the highlighted source text each comment refers to.

## Features

- **Load all comments** across every file in an Overleaf project
- **Highlighted source text** — each comment is shown alongside the original text it was made on
- **Flexible selection** — select comments individually, by file, globally, by time range, or invert selection
- **Export** to Markdown, JSON, or CSV

## Installation

1. Clone or download this repo
2. Open `chrome://extensions` (or `edge://extensions`, etc.)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project directory

## Usage

1. Open an Overleaf project page
2. Click the extension icon in the toolbar
3. Browse comments grouped by file, with highlighted source text
4. Select the comments you want (use checkboxes, Select All, time filter, or invert selection)
5. Click an export button — the file downloads automatically

### Selection tools

| Tool | Description |
|------|-------------|
| Individual checkboxes | Toggle single comments |
| File-level checkbox | Select/deselect all comments in one file |
| Select All | Select or deselect every comment |
| Time filter | Auto-select all comments written after a given date |
| Invert (⇄) | Flip the current selection |

### Export formats

- **Markdown** — grouped by file, with `latex` code blocks for highlighted text
- **JSON** — clean array of objects (file, author, time, highlightedText, content, replies)
- **CSV** — flat table with File, Author, Time, Highlighted Text, Content columns

## Requirements

- Chromium-based browser (Chrome, Edge, Brave, Arc, Dia, etc.)
- Overleaf project page must be open and loaded

## License

MIT
