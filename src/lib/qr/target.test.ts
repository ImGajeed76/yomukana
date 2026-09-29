import { describe, expect, test } from "bun:test";
import { scannedPath } from "./target";

const HERE = "http://localhost:5173";

describe("scannedPath", () => {
  test("follows the app's own codes, made on the live site", () => {
    expect(scannedPath("https://yomukana.app/@neko", HERE)).toBe("/@neko");
    expect(scannedPath("https://yomukana.app/join/abcd2345", HERE)).toBe("/join/abcd2345");
    expect(scannedPath("https://yomukana.app/display/global", HERE)).toBe("/display/global");
  });

  test("follows codes made on the copy it is running in", () => {
    expect(scannedPath("http://localhost:5173/@neko", HERE)).toBe("/@neko");
  });

  test("refuses anything else, including this site's other pages", () => {
    expect(scannedPath("https://example.com/@neko", HERE)).toBeNull();
    expect(scannedPath("https://yomukana.app.example.com/@neko", HERE)).toBeNull();
    expect(scannedPath("https://yomukana.app/settings", HERE)).toBeNull();
    expect(scannedPath("just some text", HERE)).toBeNull();
  });
});
