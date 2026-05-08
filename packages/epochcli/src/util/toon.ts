export namespace ToonEncoder {
  /**
   * Encodes a JSON object or array into a compressed TOON (Token-Oriented Object Notation) string.
   * TOON replaces JSON's heavy `{}` and `""` syntax with YAML-like indentation and CSV rows
   * to drastically save context tokens.
   */
  export function encode(data: any, indentLevel = 0): string {
    if (data === null) return "null"
    if (data === undefined) return ""

    if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
      return String(data)
    }

    const indent = "  ".repeat(indentLevel)
    let result = ""

    if (Array.isArray(data)) {
      // If array of primitives, join as CSV
      const isPrimitiveArray = data.every((item) => item === null || typeof item !== "object")

      if (isPrimitiveArray) {
        return `[${data.join(",")}]`
      }

      for (const item of data) {
        result += `${indent}- ${encode(item, indentLevel + 1).trimStart()}\n`
      }
      return result.trimEnd()
    }

    if (typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        if (value === null || typeof value !== "object") {
          result += `${indent}${key}: ${value}\n`
        } else {
          result += `${indent}${key}:\n${encode(value, indentLevel + 1)}\n`
        }
      }
      return result.trimEnd()
    }

    return String(data)
  }
}
