# Requirements

## Overview
Streamline the system prompt to minimize token usage and remove bloat, particularly optimizing for local model use.

## Core Requirements
1. **Refactor Base Prompts:** 
   - Compress `default.txt`, `gemini.txt`, and other relevant text files.
   - Remove corporate URLs (epochcli.ai, github issues).
   - Reduce the number of examples from ~7 to 1 or 2 high-value examples.
   - Condense Tone, Style, and Proactiveness rules into concise bullets.
2. **Optimize Dynamic Context (`system.ts`):**
   - Ensure the "Skills" boilerplate is only added if there are actually available skills.
   - Remove the empty `<directories>` tags that are currently hardcoded to not output anything.

## Out of Scope
- Modifying how `AGENTS.md` or instruction files are resolved (this remains useful for directory-specific context).
- Changes to the underlying LLM provider architecture or token counting logic.
