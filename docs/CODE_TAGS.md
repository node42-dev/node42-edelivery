# Codetags Reference (PEP 350)

This format is based on PEP 350 — a Python Enhancement Proposal from 2005 that was ultimately rejected and never adopted as a mainstream standard. 

Most projects today use a simpler TODO(owner): or TODO [YYYY-MM-DD]: style. **That said, PEP 350's structured field format is clean and expressive, so this repo uses it.** When in doubt, follow the examples below.

## Format

```
// MNEMONIC: Commentary. <OWNER YYYY-MM-DD d:YYYY-MM-DD p:PRIORITY>
```

| Field | Description | Example |
|-------|-------------|---------|
| `OWNER` | Initials or username of author | `MDE`, `jsmith` |
| `YYYY-MM-DD` | Date the codetag was written | `2026-03-07` |
| `d:` | Due date / removal date | `d:2026-04-07` |
| `p:` | Priority (0=low, 1=normal, 2=high, 3=critical) | `p:2` |

All fields after the commentary are **optional**. Minimum useful form: `<OWNER date>`.

## Mnemonics

| Tag | Synonyms | Meaning |
|-----|----------|---------|
| `TODO` | `MILESTONE`, `TBD` | Informal task or feature pending completion |
| `FIXME` | `XXX`, `BROKEN`, `REFACTOR`, `INSPECT` | Problematic or ugly code needing cleanup |
| `BUG` | `BUGFIX` | Reported defect tracked in bug database |
| `NOBUG` | `WONTFIX`, `DONTFIX`, `CANTFIX` | Known problem that will never be fixed |
| `HACK` | `CLEVER`, `MAGIC` | Temporary or workaround code |
| `NOTE` | `HELP` | Needs discussion or further investigation |
| `CAVEAT` | `WARNING`, `CAUTION` | Non-intuitive gotcha or implementation detail |
| `DEPRECATED` | — | Code scheduled for removal |
| `RFE` | `NYI`, `FR` | Request for enhancement / not yet implemented |
| `IDEA` | — | Informal RFE candidate |
| `PORT` | `PORTABILITY` | OS or runtime-specific workaround |
| `SEE` | `REF`, `REFERENCE` | Pointer to other code or external link |
| `???` | `QUESTION`, `WTF` | Misunderstood or unclear detail |
| `!!!` | `ALERT` | Needs immediate attention |

## Examples

```js
// TODO: Add input validation. <jsmith 2026-03-07>

// FIXME: This breaks on empty arrays. <jsmith 2026-03-07 p:2>

// DEPRECATED: Replaced by fs.cpSync recursive copy. <jsmith 2026-03-07 d:2026-04-07>
// export function oldInitSchematrons() { ... }

// HACK: Workaround for Commander singleton bug when bundled. <jsmith 2026-03-07>

// BUG: Crashes if cert is null and context has no keyPass. <jsmith 2026-03-07 p:3>

// CAVEAT: SaxonJS cannot compile XSL to SEF at runtime — must use xslt3 CLI. <jsmith 2026-03-07>

// NOTE: getCertDetails returns null if senderCert not loaded first. <jsmith 2026-03-07>
```

## Rules

- Codetag must be on its **own line**, never inline with code
- Match the **indentation** of surrounding code
- End with `<>` (even if no fields) — or omit `<>` for bare minimal form
- Prefer `#` / `//` line comments over block comments
- Each `TODO`/`FIXME` should have either an **expiry date** or a **ticket number**