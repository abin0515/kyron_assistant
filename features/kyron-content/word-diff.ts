export type DiffPart = { text: string; kind: "same" | "added" | "removed" };

const MAX_CELLS = 250_000;

// Word-level difference between two texts, so a short change inside a long
// passage is easy to spot. Whitespace is kept with the word before it.
export function diffWords(before: string, after: string): DiffPart[] {
  const left = tokenize(before);
  const right = tokenize(after);

  if (left.length * right.length > MAX_CELLS) {
    return [
      { text: before, kind: "removed" },
      { text: after, kind: "added" },
    ];
  }

  return merge(walk(left, right, commonLengths(left, right)));
}

function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

// lengths[i][j]: longest common run of left[i..] and right[j..].
function commonLengths(left: string[], right: string[]): number[][] {
  const lengths = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        same(left[i], right[j]) ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  return lengths;
}

function walk(left: string[], right: string[], lengths: number[][]): DiffPart[] {
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (same(left[i], right[j])) {
      parts.push({ text: right[j], kind: "same" });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      parts.push({ text: left[i], kind: "removed" });
      i += 1;
    } else {
      parts.push({ text: right[j], kind: "added" });
      j += 1;
    }
  }

  left.slice(i).forEach((text) => parts.push({ text, kind: "removed" }));
  right.slice(j).forEach((text) => parts.push({ text, kind: "added" }));

  return parts;
}

function merge(parts: DiffPart[]): DiffPart[] {
  return parts.reduce<DiffPart[]>((merged, part) => {
    const last = merged.at(-1);

    if (last && last.kind === part.kind) {
      last.text += part.text;
    } else {
      merged.push({ ...part });
    }

    return merged;
  }, []);
}

function same(left: string, right: string): boolean {
  return left.trim() === right.trim();
}
