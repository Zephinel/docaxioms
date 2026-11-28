// Read-only Doc-Gardening manifest generator (A0, A1, A2, A6).
// Surfaces every K3 description document and the stage card, with line budgets, active code pins,
// and codeToDocs mappings so a fresh reader or agent can run a structured fact-check audit.
import { resolve } from "node:path";
import { descriptionDocs, project } from "./check.mjs";
import { parsePinComment } from "./pins.mjs";

export function gardenManifest(root, profile) {
  const p = project(resolve(root), profile);
  const docs = descriptionDocs(p, p.profile.garden?.exempt ?? []);
  const mappings = p.profile.codeToDocs ?? [];

  const items = docs.map((file) => {
    const text = p.read(file);
    const lines = text.trimEnd().split("\n").length;
    const pins = p.markdown(file).htmlComments.map(parsePinComment).filter((pin) => pin && !pin.malformed);
    const mappedCode = mappings
      .filter((mapping) => (Array.isArray(mapping.docs) ? mapping.docs : [mapping.docs]).includes(file))
      .flatMap((mapping) => (Array.isArray(mapping.code) ? mapping.code : [mapping.code]));
    return {
      file,
      lines,
      chars: text.length,
      pins: pins.length,
      mappedCode,
    };
  });

  const coreDir = p.profile.core?.dir;
  const guidePath = coreDir && p.isFile(`${coreDir}/GARDEN.md`) ? `${coreDir}/GARDEN.md` : null;
  const cardFile = p.profile.card?.file;
  const stageCard = cardFile && p.isFile(cardFile)
    ? {
      file: cardFile,
      lines: p.read(cardFile).trimEnd().split("\n").length,
      chars: p.read(cardFile).length,
    }
    : null;

  return {
    root: p.root,
    guidePath,
    descriptions: items,
    decisionsFile: p.profile.decisions?.file ?? null,
    stageCard,
  };
}
