export type Profile = {
  item: string;
  weight: string;
  surface: string;
  drilling: string;
  count: string;
};
export type Presentation = {
  kind: "product" | "demo" | "purchase" | "guidance";
  profile: Profile;
  assessment: { status: string; title: string; text: string };
  choices?: string[];
};
export const blankProfile: Profile = {
  item: "",
  weight: "",
  surface: "",
  drilling: "",
  count: "",
};
export function validPresentation(value: any): value is Presentation {
  return (
    value &&
    ["product", "demo", "purchase", "guidance"].includes(value.kind) &&
    value.assessment &&
    typeof value.assessment.text === "string" &&
    typeof value.assessment.status === "string" &&
    value.profile &&
    Object.keys(blankProfile).every((k) => typeof value.profile[k] === "string")
  );
}
