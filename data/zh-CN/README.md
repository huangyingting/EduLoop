# AMC Chinese translations

`amc8.json`, `amc10.json`, and `amc12.json` are Simplified Chinese machine translations of the corresponding source archives one directory above. IDs, answers, metadata, LaTeX structure, and local figure references are preserved. The translated files stay in this subdirectory so the default seed does not import duplicate source IDs.

Regenerate them with `npm run data:translate:amc` and validate structural parity with `npm run data:audit:amc:zh`.
