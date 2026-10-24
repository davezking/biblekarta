# scripture-fixtures

Not Bible text. Used only when the private scripture repo is unavailable (forks, local dev without a token).

- `books-meta.json`: the 66 books (id, scan `name_am`, `name_en`, testament, scan `order_66`). Same ids and order as `biblekarta-scripture/scripture/books-meta.json`. Book names are metadata (from the PRD appendix table), not verse text.
- `books/fixture.json`: a made-up **test book** of ordinary Amharic sentences. Stored with single spaces, never ፡.
- `checksums.json`: SHA-256 of each verse's `t`, keyed `fixture.<chapter>.<verse>`.
- `verse-counts.json`: verses per chapter.
