# gemma-4-json-sanitization - Tasks Document

## Implementation Plan

- [x] 1.1 Implement `sanitizeGemma4` helper function
  - **Objective**: Create the core recursive function to clean up JSONSchema7 for Gemma 4.
  - **Files**: `packages/epochcli/src/provider/transform.ts`
  - **Details**:
    - Add a function `sanitizeGemma4(obj: any): any` below or near `sanitizeGemini`.
    - It must iterate through object properties.
    - If `key === 'description'`, replace all `"` with `'`.
    - If `obj` has `anyOf`, `oneOf`, or `allOf`, reduce it to a simple type (e.g., picking the first valid non-null type).
    - Flatten nested `properties` where possible (e.g., moving nested object properties to the top level with dot-notation keys, or just forcing them to be simple string types if flattening is too complex). For now, enforce that `properties` does not contain deeply nested objects, or convert them to `type: "string"` as a fallback, per the Gemma 4 documentation.
  - **Requirement Ref**: Core Features (Flatten nested objects, replace quotes, enforce strict typing).

- [x] 1.2 Wire `sanitizeGemma4` into `ProviderTransform.schema`
  - **Objective**: Apply the new sanitizer conditionally based on the model ID.
  - **Files**: `packages/epochcli/src/provider/transform.ts`
  - **Details**:
    - Check if `model.api.id.includes("gemma-4") || model.id.includes("big-pickle")`.
    - If true, return `sanitizeGemma4(schema) as JSONSchema7`.
  - **Requirement Ref**: Core Features (Detect `gemma-4` or `big-pickle`).

- [x] 1.3 Add unit tests for Gemma 4 schema sanitization
  - **Objective**: Verify the sanitization logic works as expected.
  - **Files**: `packages/epochcli/test/provider/transform.test.ts`
  - **Details**:
    - Create a test suite `ProviderTransform.schema - gemma4`.
    - Test quote replacement in descriptions.
    - Test type flattening/simplification for `anyOf`/`oneOf`.
    - Test nested object flattening.
  - **Requirement Ref**: Acceptance Criteria (Unit tests).
