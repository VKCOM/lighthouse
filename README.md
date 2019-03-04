# LightHouse
LightHouse is a lightweight GUI interface for ClickHouse. Do not confuse it with LightHouse from Google (https://github.com/GoogleChrome/lighthouse). Interface is inspired by Sequel Pro (https://www.sequelpro.com/).

# Usage
Just clone this repository and use index.html in your browser.
If you need to specify username (e.g. XXX), then add "/?user=XXX" to your URL, e.g. "http://127.0.0.1:8123/?user=XXX".
If you want to force basic auth instead of URL-based (basic auth does not work with CORS, be careful), then add "/?basic_user=XXX" instead.

# Features
You can do the following using LightHouse:

1. See tables list, filter it
2. See table size on disk and estimated number of rows
3. See table contents with filters and sorting
4. Execute read-only queries in SQL editor

That's it! It is not meant to be a full-fledged replacement for tabix, for example.

# License

MIT License.
Based on:

- AG Grid https://www.ag-grid.com/
- ACE editor https://ace.c9.io/
- jQuery https://jquery.org/
- Tabix patches for ACE Editor https://github.com/tabixio/tabix
