// A Kyron draft (lesson collection) ID from a URL segment, or null.
export function parseKyronDraftId(value: string): number | null {
  if (!/^\d{1,12}$/.test(value)) {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
