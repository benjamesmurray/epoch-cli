# gemma-4-json-sanitization - Design Document

## Overview

This feature implements a specialized JSON schema sanitizer for tool calling with the Gemma 4 (and big-pickle) model. Gemma 4 is highly sensitive to nested objects, double quotes in descriptions, and complex types in JSON schemas. This sanitizer ensures that tool schemas sent to the model are flattened, use single quotes in descriptions, and enforce strict, simple types.

## Architecture

The logic will reside in `packages/epochcli/src/provider/transform.ts`.
A new helper function, `sanitizeGemma4`, will be introduced alongside the existing `sanitizeGemini` function. The `schema` export in `ProviderTransform` will check if the `model.api.id` includes "gemma-4" or the `model.id` includes "big-pickle", and if so, it will run the schema through `sanitizeGemma4`.

## Components and Interfaces

- `packages/epochcli/src/provider/transform.ts`:
  - `ProviderTransform.schema(model: Provider.Model, schema: JSONSchema7): JSONSchema7`: Modified to detect Gemma 4 models and call the `sanitizeGemma4` function.
  - `sanitizeGemma4(schema: JSONSchema7): JSONSchema7`: A new recursive (or deep-mapping) function that:
    1. Replaces `"` with `'` in all `description` fields.
    2. Flattens nested object properties into a single level, potentially by combining keys (e.g., `parent.child`).
    3. Removes `anyOf`, `oneOf`, `allOf` by selecting the first valid simple type.

## Data Models

No new data models. We operate on `JSONSchema7` objects.

## Error Handling

The sanitization logic must be robust to missing fields, nulls, and malformed schemas, safely ignoring structures it doesn't recognize instead of throwing errors.

## Testing Strategy

Add tests in `packages/epochcli/test/provider/transform.test.ts` to cover the `sanitizeGemma4` logic:
- Verify that descriptions with `"` are converted to `'`.
- Verify that nested `properties` are flattened to single-level keys.
- Verify that `anyOf`/`oneOf` are simplified to standard primitive types.
