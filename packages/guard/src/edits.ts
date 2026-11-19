export interface ProposedChange {
  filePath: string;
  before: string | null;
  after: string;
}

interface EditOp {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

const PATH_KEYS = ["file_path", "path", "target_file", "filePath"];
const CONTENT_KEYS = ["content", "contents", "file_text", "code_edit_full"];

/**
 * Computes the file content a write/edit tool call would produce.
 * Returns null when the call is not a file edit or the result cannot be determined.
 */
export function proposedChange(
  toolInput: Record<string, unknown> | undefined,
  readFile: (filePath: string) => string | null,
): ProposedChange | null {
  if (!toolInput) return null;
  const filePath = PATH_KEYS.map((k) => toolInput[k]).find((v): v is string => typeof v === "string");
  if (!filePath) return null;
  const before = readFile(filePath);

  const content = CONTENT_KEYS.map((k) => toolInput[k]).find((v): v is string => typeof v === "string");
  if (content !== undefined) return { filePath, before, after: content };

  const edits: EditOp[] = [];
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits as Array<Record<string, unknown>>) {
      if (typeof e?.old_string !== "string" || typeof e?.new_string !== "string") return null;
      edits.push({ old_string: e.old_string, new_string: e.new_string, replace_all: e.replace_all === true });
    }
  } else if (typeof toolInput.old_string === "string" && typeof toolInput.new_string === "string") {
    edits.push({
      old_string: toolInput.old_string,
      new_string: toolInput.new_string,
      replace_all: toolInput.replace_all === true,
    });
  }
  if (edits.length === 0) return null;

  let after = before ?? "";
  for (const edit of edits) {
    const next = applyEdit(after, edit);
    if (next === null) return null;
    after = next;
  }
  return { filePath, before, after };
}

function applyEdit(text: string, edit: EditOp): string | null {
  if (edit.old_string === "") return text === "" ? edit.new_string : null;
  const index = text.indexOf(edit.old_string);
  if (index === -1) return null;
  if (edit.replace_all) return text.split(edit.old_string).join(edit.new_string);
  return text.slice(0, index) + edit.new_string + text.slice(index + edit.old_string.length);
}
