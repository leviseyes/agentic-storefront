export function demoFollowUp(reason, {cartQuantity=0,available=false}={}) {
  if(reason==='dismissed')return {
    text:'What would help you decide—checking whether it fits your item, or seeing what’s included?',
    choices:['Will it work for my frame?',"What's included?",'Watch the demonstration again'],
  };
  if(cartQuantity>0)return {
    text:'Now that you’ve seen how it works, would you like to check the fit for your item or review your cart?',
    choices:['Will it work for my frame?','Show me my cart','I have another question'],
  };
  return available?{
    text:'Could this work for something you’d like to hang? We can check the fit, or I can add one to your cart.',
    choices:['Will it work for my frame?','Add 1 to my cart','I have another question'],
  }:{
    text:'Now that you’ve seen how it works, what would you like to hang? I can help you check whether Studio is a good fit.',
    choices:['Will it work for my frame?',"What's included?",'I have another question'],
  };
}
