# gemma-4-json-sanitization - Requirements Document

Implement a Gemma 4 specific JSON schema sanitizer for tool calling. It must flatten nested objects, replace double quotes with single quotes in descriptions (to avoid <|"> conflicts), and enforce strict types by removing anyOf/oneOf.

## Core Features

- Detect when the active model is `gemma-4` or `big-pickle`.
- When sanitizing the tool JSON schema, flatten nested object properties to a single level if possible, using dot-notation or underscore-notation for keys, or simply unpacking them.
- Replace double quotes `"` with single quotes `'` inside the schema `description` strings, preventing conflict with Gemma 4's native token `<|">`.
- Enforce strict typing by removing complex types like `anyOf`, `oneOf`, and `allOf`, resolving to the primary simple type.

## User Stories

- As a developer using the CLI with Gemma 4 or big-pickle, I want my tools to be reliably parsed, so that the agentic loop functions without constant JSON parsing failures.

## Acceptance Criteria

- [ ] Tool schemas provided to Gemma 4 models are intercepted and sanitized in `ProviderTransform.schema`.
- [ ] Schema `description` fields containing `"` are converted to `'`.
- [ ] Nested object structures in `properties` are flattened to single-level key-value pairs where applicable.
- [ ] Schema combinations like `anyOf` and `oneOf` are reduced to simple, strict types.
- [ ] Unit tests verify these transformations on `ProviderTransform.schema`.

## Non-functional Requirements

- Performance: The sanitization logic should execute in negligible time.
- Compatibility: This sanitization logic must strictly apply *only* to Gemma 4 models and not disrupt Anthropic, OpenAI, or standard Gemini.
