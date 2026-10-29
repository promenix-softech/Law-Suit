/**
 * UI language (English / Marathi). Keys are the English strings, so a missing Marathi entry
 * simply falls back to English. Legal terms follow the marathi-legal-glossary skill; terms
 * marked † there are kept in English here until the advocate confirms them.
 */

export type Lang = "en" | "mr";
export const LANG_COOKIE = "lang";
export const isLang = (v: unknown): v is Lang => v === "en" || v === "mr";

const MR: Record<string, string> = {
  // case status
  "Bank call": "बँक कॉल",
  "Case created": "प्रकरण तयार",
  "Docs uploaded": "कागदपत्रे अपलोड",
  "Extraction review": "माहिती तपासणी",
  "Notice generated": "नोटीस तयार",
  "Notice sent": "नोटीस पाठवली",
  "12A mediation": "12A मध्यस्थी",
  Drafting: "मसुदा लेखन",
  "In approval": "मंजुरीसाठी",
  Approved: "मंजूर",
  "Notary / stamp": "नोटरी / स्टॅम्प",
  "E-filing ready": "ई-फायलिंग तयार",
  Filed: "दाखल",
  Listed: "सुनावणीस लागले",
  Disposed: "निकाली",
  // draft status
  Draft: "मसुदा",
  "Awaiting approval": "मंजुरीच्या प्रतीक्षेत",
  Returned: "परत पाठवला",
  // top bar
  "+ New case": "+ नवीन प्रकरण",
  "Audit log": "ऑडिट लॉग",
  "Bulk upload": "बल्क अपलोड",
  Billing: "बिलिंग",
  "Office settings": "कार्यालय सेटिंग्ज",
  "Suit particulars": "दाव्याचे तपशील",
  "Sign out": "बाहेर पडा",
  "no role": "भूमिका नाही",
  Search: "शोधा",
  // dashboard
  "Good day": "नमस्कार",
  "Here is where your cases stand.": "तुमच्या प्रकरणांची सद्यस्थिती.",
  Cases: "प्रकरणे",
  "Visible to you": "तुम्हाला दिसणारी",
  Commercial: "वाणिज्यिक",
  "Sec 12A applies": "कलम 12A लागू",
  "In your queue": "तुमच्या रांगेत",
  "Across your cases": "तुमच्या सर्व प्रकरणांत",
  "My tasks": "माझी कामे",
  "Assigned to you": "तुम्हाला दिलेली",
  "Awaiting my approval": "माझ्या मंजुरीच्या प्रतीक्षेत",
  Review: "तपासा",
  "Nothing waiting for approval.": "मंजुरीसाठी काहीही प्रलंबित नाही.",
  Case: "प्रकरण",
  Borrower: "कर्जदार",
  Status: "स्थिती",
  Type: "प्रकार",
  Claim: "दावा रक्कम",
  "Summary (O.37)": "संक्षिप्त (O.37)",
  Ordinary: "सामान्य",
  "No cases visible to you.": "तुम्हाला कोणतेही प्रकरण दिसत नाही.",
  "Open task view →": "कामांचे दृश्य उघडा →",
  "No tasks assigned.": "कोणतेही काम दिलेले नाही.",
  // deadlines
  "Needs attention": "लक्ष द्या",
  "Nothing urgent. Limitation, 12A, notice and approval dates are all comfortable.":
    "काहीही तातडीचे नाही. मुदत, 12A, नोटीस आणि मंजुरीच्या तारखा सुरक्षित आहेत.",
  "Limitation watch": "मुदत (limitation) लक्ष",
  "12A mediation period ends": "12A मध्यस्थीची मुदत संपते",
  "Notice period over — next step": "नोटीसची मुदत संपली — पुढील पायरी",
  "Approval pending": "मंजुरी प्रलंबित",
  "Task overdue": "काम उशिरा",
  "Task due today": "काम आज देय",
  overdue: "उशीर",
  "days left": "दिवस बाकी",
  "days overdue": "दिवस उशीर",
  today: "आज",
  "Limitation watch = 3 years from NPA date − 90 days; advocate to confirm (acknowledgements extend it).":
    "मुदत लक्ष = NPA तारीख − 90 दिवस + 3 वर्षे; वकिलांनी खात्री करावी (पोचपावतीने मुदत वाढते).",
  // command palette
  "Type a case no., borrower or action…": "प्रकरण क्र., कर्जदार किंवा कृती टाइप करा…",
  "Go to": "जा",
  Dashboard: "डॅशबोर्ड",
  "New case": "नवीन प्रकरण",
  "Field tasks": "फील्ड कामे",
  "Switch to English": "Switch to English",
  "Switch to Marathi": "मराठीत बदला",
  Loading: "लोड होत आहे",
  "No matches.": "काहीही सापडले नाही.",
  "to open": "उघडण्यासाठी",
  "to move": "हलवण्यासाठी",
  "to close": "बंद करण्यासाठी",
  // case page
  Team: "टीम",
  "Demand notice dispatch": "मागणी नोटीस पाठवणी",
  "Sec 12A pre-institution mediation": "कलम 12A पूर्व-दावा मध्यस्थी",
  Documents: "कागदपत्रे",
  "Extracted data — review": "काढलेली माहिती — तपासणी",
  Drafts: "मसुदे",
  "E-filing bundle": "ई-फायलिंग संच",
  Preview: "पहा",
  "Preview unavailable — download the DOCX instead.": "पूर्वावलोकन उपलब्ध नाही — DOCX डाउनलोड करा.",
  Close: "बंद करा",
  Download: "डाउनलोड",
  // navigation and dashboard (29 Oct)
  Work: "काम",
  Office: "कार्यालय",
  Approvals: "मंजुरी",
  "Banks & courts": "बँका व न्यायालये",
  "Team & roles": "टीम व भूमिका",
  "Quick actions": "झटपट कामे",
  All: "सर्व",
  "Needs action": "कारवाई बाकी",
  "Approved / filed": "मंजूर / दाखल",
  Open: "उघडा",
  "No cases in this view.": "या यादीत प्रकरणे नाहीत.",
  "Open scan": "स्कॅन उघडा",
  "Or generate one paper at a time": "किंवा एक-एक कागद तयार करा",
  Admin: "प्रशासक",
  Drafter: "मसुदा लेखक",
  Approver: "मंजूरकर्ता",
  Field: "फील्ड",
  Person: "व्यक्ती",
  Roles: "भूमिका",
  Approving: "मंजुरी",
  "Open tasks": "बाकी कामे",
  you: "तुम्ही",
  "Adding a new person": "नवीन व्यक्ती जोडणे",
  "Bank branches": "बँक शाखा",
  Courts: "न्यायालये",
  "No branches yet.": "अजून शाखा नाहीत.",
  "No courts yet.": "अजून न्यायालये नाहीत.",
};

export type T = (en: string) => string;

export function translator(lang: Lang): T {
  return lang === "mr" ? (en) => MR[en] ?? en : (en) => en;
}
