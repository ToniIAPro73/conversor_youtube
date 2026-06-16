#!/usr/bin/env bash
# Generate text-based test fixtures for the Anclora FileStudio integration tests.
# Run from the project root: bash tests/fixtures/generate-fixtures.sh

set -euo pipefail

FIXTURE_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── sample.md ────────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.md" <<'MARKDOWN'
# Sample Document

This is a **test markdown file** for integration testing.

## Section 1

- Item one
- Item two
- Item three

## Section 2

Some `inline code` and a code block:

```python
def hello():
    print("Hello, world!")
```

### Subsection

> A blockquote for good measure.
MARKDOWN

# ── sample.txt ───────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.txt" <<'TEXT'
This is a plain text file.
It contains multiple lines of text.
Each line is simple ASCII content.
No special formatting or structure.
TEXT

# ── sample.html ──────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.html" <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sample HTML</title>
</head>
<body>
  <h1>Sample HTML Document</h1>
  <p>This is a <strong>test</strong> HTML file for integration testing.</p>
  <ul>
    <li>Item A</li>
    <li>Item B</li>
  </ul>
</body>
</html>
HTML

# ── sample.json ──────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.json" <<'JSON'
{
  "name": "Anclora FileStudio Test",
  "version": "0.1.0",
  "features": ["convert", "analyze", "batch"],
  "metadata": {
    "author": "test-suite",
    "purpose": "integration-test"
  }
}
JSON

# ── sample.yaml ──────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.yaml" <<'YAML'
name: Anclora FileStudio Test
version: "0.1.0"
features:
  - convert
  - analyze
  - batch
metadata:
  author: test-suite
  purpose: integration-test
YAML

# ── sample.csv ───────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.csv" <<'CSV'
id,name,type,size
1,document1,pdf,1024
2,image1,png,2048
3,audio1,mp3,4096
CSV

# ── sample.xml ───────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <item id="1">
    <name>document1</name>
    <type>pdf</type>
    <size>1024</size>
  </item>
  <item id="2">
    <name>image1</name>
    <type>png</type>
    <size>2048</size>
  </item>
</catalog>
XML

# ── sample.toml ──────────────────────────────────────────────────────────────
cat > "$FIXTURE_DIR/sample.toml" <<'TOML'
name = "Anclora FileStudio Test"
version = "0.1.0"

[metadata]
author = "test-suite"
purpose = "integration-test"
TOML

echo "✅ Text fixtures generated in $FIXTURE_DIR"
