export interface CommandSnippet {
  id: string;
  name: string;
  command: string;
  updatedAt: number;
}
export const SNIPPETS_KEY = "ultron.command-snippets.v1";
export function loadSnippets(
  storage: Pick<Storage, "getItem">,
): CommandSnippet[] {
  const raw = storage.getItem(SNIPPETS_KEY);
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (
    !Array.isArray(data) ||
    !data.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.command === "string" &&
        typeof item.updatedAt === "number" &&
        Number.isFinite(item.updatedAt),
    ) ||
    new Set(data.map((item) => item.id)).size !== data.length
  ) {
    throw Error(
      "Saved snippets could not be read. Existing data has not been changed.",
    );
  }
  return data;
}
export function saveSnippets(
  storage: Pick<Storage, "setItem">,
  snippets: CommandSnippet[],
) {
  storage.setItem(SNIPPETS_KEY, JSON.stringify(snippets));
}
export function prepareSnippet(
  command: string,
  bracketedPaste: boolean,
): string {
  if (command.length > 65536)
    throw Error("Commands must be 65,536 characters or less.");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(command))
    throw Error(
      "This snippet contains terminal control characters. Remove them before inserting.",
    );
  const text = command.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!text.trim()) throw Error("Enter a command first.");
  if (!bracketedPaste && /[\n\t]/.test(text))
    throw Error(
      "This terminal is not accepting bracketed paste. Copy the command, or use a single line to avoid running it while inserting.",
    );
  return text;
}
