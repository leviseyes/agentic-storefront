export const voiceOptions = [
  { id: "man", label: "A man", name: "Chris", description: "Warm and relaxed" },
  { id: "woman", label: "A woman", name: "Jessica", description: "Bright and welcoming" },
] as const;

export type VoiceChoice = (typeof voiceOptions)[number]["id"];
export type VoicePreference = VoiceChoice | "text";
const key = "agentic-voice-preference-v1";
export function isVoiceChoice(value: unknown): value is VoiceChoice {
  return value === "man" || value === "woman";
}
export function readVoicePreference(storage?: Pick<Storage, "getItem">): VoicePreference | null {
  try {
    const value = (storage ?? localStorage).getItem(key);
    return isVoiceChoice(value) || value === "text" ? value : null;
  } catch { return null; }
}
export function saveVoicePreference(value: VoicePreference, storage?: Pick<Storage, "setItem">) {
  try { (storage ?? localStorage).setItem(key, value); return true; }
  catch { return false; }
}
