import * as fs from "fs/promises";
import type { TestConfig } from "./types";

export class ConfigLoader {
  public static async load(filePath: string): Promise<TestConfig[]> {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const config = JSON.parse(data);
      if (!Array.isArray(config)) {
          return [config as TestConfig];
      }
      return config as TestConfig[];
    } catch (e: any) {
      throw new Error(`Failed to load config from ${filePath}: ${e.message}`);
    }
  }
}
