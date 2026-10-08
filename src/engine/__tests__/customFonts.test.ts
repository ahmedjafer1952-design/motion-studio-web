import { describe, expect, it } from "vitest";
import { parseFontFileName } from "../customFonts";

describe("parseFontFileName", () => {
  it("reads family and weight from common file names", () => {
    expect(parseFontFileName("thmanyahsans-Bold.otf")).toEqual({ family: "thmanyahsans", weight: "700", style: "normal" });
    expect(parseFontFileName("thmanyahserifdisplay-Black.woff2").weight).toBe("900");
    expect(parseFontFileName("thmanyahsans-Light.otf").weight).toBe("300");
    expect(parseFontFileName("MyFont-SemiBoldItalic.ttf")).toEqual({ family: "MyFont", weight: "600", style: "italic" });
    expect(parseFontFileName("Plain.ttf")).toEqual({ family: "Plain", weight: "400", style: "normal" });
  });
});
