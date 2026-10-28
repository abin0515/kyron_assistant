import { describe, expect, it } from "vitest";

import { parseKyronDestination } from "@/server/kyron/destination";

describe("Kyron destination validation", () => {
  it("accepts the top-level Library", () => {
    expect(
      parseKyronDestination({ folderId: null, path: [] }),
    ).toEqual({ destination: { folderId: null, path: [] } });
  });

  it("accepts a nested path ending at the selected folder", () => {
    const destination = {
      folderId: 6121,
      path: [
        { id: 612, name: "EM 612" },
        { id: 6121, name: "Module 1" },
      ],
    };

    expect(parseKyronDestination(destination)).toEqual({ destination });
  });

  it("rejects a path that does not end at the selected folder", () => {
    expect(
      parseKyronDestination({
        folderId: 6121,
        path: [{ id: 612, name: "EM 612" }],
      }),
    ).toEqual({
      errors: ["Kyron folder path does not match the selected folder."],
    });
  });
});
