---
name: file-creation
description: >-
  Workflow for creating and overwriting files in the JLC Loan Calculator project. Ensures the
  write tool is called with both required parameters (content and filePath), parent directories
  exist, and existing files are read first. Use when creating new source files, components, or
  configuration.
category: development
metadata:
  suggest_for:
    filename:
      - '*.ts'
      - '*.tsx'
      - '*.css'
      - '*.json'
      - 'vite.config.*'
---

# File Creation Workflow (JLC Loan Calculator)

## The Write Tool Schema

The Kilo `write` tool requires exactly two string parameters. Omitting either causes a
validation error:

```
The write tool was called with invalid arguments:
  ["content"]: is missing and is required
  ["filePath"]: is missing and is required
```

**Always call write with both parameters:**

```
write({
  filePath: "C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog\src\components\NewFile.tsx",
  content: "<full file contents>"
})
```

## Step 1: Ensure the Target Directory Exists

Before writing to a path, verify the parent directory exists:

```bash
Test-Path -LiteralPath "C:\path\to\parent\directory"
```

If it does not exist, create it:

```powershell
New-Item -ItemType Directory -Path "C:\path\to\parent\directory" -Force
```

### Common project paths

| Area               | Absolute path (worktree)                                                |
|--------------------|-------------------------------------------------------------------------|
| Source components  | `C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog\src\components` |
| Source lib         | `C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog\src\lib`      |
| Source root        | `C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog\src`          |
| Public assets      | `C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog\public`       |
| Project root       | `C:\Users\ajdpe\projectA\jlcx\.kilo\worktrees\organized-fog`               |

## Step 2: Read Before Overwriting

If the target file already exists, always read it first with the `read` tool before calling
`write`. The `write` tool overwrites the entire file, so you need the full current content to
preserve existing code.

For small targeted changes to existing files, prefer the `edit` tool instead of `write`.

## Step 3: Write With Complete Content

When creating a new file, the `content` parameter must contain the **complete file text** —
not a partial snippet, not a placeholder like `"..."` or `"TODO"`, and not an object.

Example — creating a new TypeScript library file:

```typescript
// Full file content goes here
export interface MyType {
  field: string;
}
```

## Step 4: Verify

After writing:
1. Run `npm run typecheck` to verify TypeScript compiles
2. Run `npm run lint` to verify oxlint passes
3. Read the file back to confirm content was written correctly

## Decision Matrix: Which Tool?

| Task                                         | Tool   | Notes                              |
|----------------------------------------------|--------|------------------------------------|
| Create a brand-new file                      | `write` | Provide full absolute `filePath` and complete `content` |
| Overwrite an existing file entirely        | `write` | Read first, then provide full content |
| Small change to existing file (1–5 lines)    | `edit`  | Provide `oldString` and `newString` |
| Rename/replace repeated string in a file     | `edit`  | Use `replaceAll: true`             |
| Append to end of existing file               | `edit`  | Match last few lines as `oldString`, include new content in `newString` |
