import "server-only";

// The renderer lives with the templates so the worker produces identical DOCX files.
export { renderDocx, type CourtMargins } from "@civil-suits/templates/docx";
