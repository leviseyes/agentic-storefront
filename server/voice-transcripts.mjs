// A provider item identifies one utterance. Revisions and redelivery replace
// that item's text; identical words with a different ID are a separate turn.
export function uniqueVoiceMessages(messages){
 const result=[],positions=new Map();
 for(const message of messages){
  const key=message.role==='user'&&message.id?message.id:null;
  if(key&&positions.has(key))result[positions.get(key)]={...result[positions.get(key)],...message};
  else{if(key)positions.set(key,result.length);result.push(message);}
 }
 return result;
}
