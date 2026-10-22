import test from "node:test";
import assert from "node:assert/strict";
import { readVoicePreference, saveVoicePreference } from "../client/voice/preferences.ts";

test("an anonymous voice preference survives reload without storing chat or identity", () => {
  const values=new Map();
  const storage={getItem:(k)=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  assert.equal(readVoicePreference(storage),null);
  assert.equal(saveVoicePreference("woman",storage),true);
  assert.equal(readVoicePreference(storage),"woman");
  assert.deepEqual([...values.values()],["woman"]);
  saveVoicePreference("man",storage);
  assert.equal(readVoicePreference(storage),"man");
  saveVoicePreference("text",storage);
  assert.equal(readVoicePreference(storage),"text");
});
test("blocked storage and invalid preferences do not prevent a visitor from choosing", () => {
  const blocked={getItem(){throw Error("Blocked");},setItem(){throw Error("Blocked");}};
  assert.equal(readVoicePreference(blocked),null);
  assert.equal(saveVoicePreference("woman",blocked),false);
  for(const value of ["", "invalid", "null", '{"voice":"woman"}'])
    assert.equal(readVoicePreference({getItem:()=>value}),null);
});
