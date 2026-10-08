---
name: write-tool
description: >-
  Ensures the Kilo write tool is always called with both required parameters (content and
  filePath), preventing the "is missing and is required" schema validation error. Use when
  creating new files or when the write tool has previously failed due to missing arguments.
category: code-quality
suggest_for:
  filename:
    - '*.ts'
    - '*.tsx'
    - '*.json'
    - '*.md'
    - '*.css'
    - '*.html'
    - '*.*'
---

# Write Tool — Required Parameters

## Problem

The Kilo `write` tool requires **two** parameters and will fail if either is missing:

```
The write tool was called with invalid arguments:
  ["content"]: is missing and is required
  ["filePath"]: is missing and is required
```

## Required Parameters

| Parameter  | Type   | Required | Description                                                                 |
|------------|--------|----------|-----------------------------------------------------------------------------|
| `filePath` | string | YES      | Absolute path to the file to write. Must be absolute, not relative.         |
| `content`  | string | YES      | The full text content to write to the file.                                  |

## Core Rules

1. **Always provide both `filePath` and `content`** — never call `write` with only one.
2. **Use absolute paths** for `filePath` (e.g. `C:\Users\ajdpe\projectA\jlcx\src\file.ts`), not relative paths.
3. **`content` must be a complete string** — include the full file contents, not a partial snippet or placeholder.
4. **Before calling `write` on an existing file**, read the file first with the `read` tool.
5. **Prefer editing existing files** with the `edit` tool when the file already exists and you are making targeted changes. Use `write` only for creating new files or full rewrites.

## Common Mistakes to Avoid

### Mistake: Omitting `content`
```json
{"filePath": "C:/path/to/file.ts"}
```
**Fix:** Always include `content` with the full file text.
```json
{"filePath": "C:/path/to/file.ts", "content": "export function foo() {}"}
```

### Mistake: Omitting `filePath`
```json
{"content": "export function foo() {}"}
```
**Fix:** Always include `filePath` with an absolute path.
```json
{"filePath": "C:/path/to/file.ts", "content": "export function foo() {}"}
```

### Mistake: Using a relative path for `filePath`
```json
{"filePath": "src/file.ts", "content": "..."}
```
**Fix:** Always use an absolute path.
```json
{"filePath": "C:/Users/ajdpe/projectA/jlcx/src/file.ts", "content": "..."}
```

### Mistake: Passing an object or array instead of a string for `content`
```json
{"filePath": "file.ts", "content": {"code": "export function foo() {}"}}
```
**Fix:** `content` must be a plain string.
```json
{"filePath": "file.ts", "content": "export function foo() {}"}
```

## Decision: Write vs Edit

| Scenario                                   | Tool  |
|--------------------------------------------|-------|
| Creating a brand-new file                  | `write` |
| Overwriting an entire existing file        | `write` (after `read`) |
| Making a small change to an existing file  | `edit`  |
| Renaming a variable across the file        | `edit` with `replaceAll` |

## Checklist Before Calling Write

- [ ] `filePath` is an absolute path
- [ ] `content` is a non-empty string containing the full file text
- [ ] If overwriting, the file has been read first
- [ ] If creating a new file, the parent directory exists
