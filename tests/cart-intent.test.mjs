import test from 'node:test';
import assert from 'node:assert/strict';
import {cartPermission,requestedCartQuantity} from '../server/cart-intent.mjs';
test('polite cart instructions are actions; hypotheticals and explanations are not',()=>{
 for(const input of ['Can you add two to my cart?','Could you remove one hanger please?','Would you empty my cart?','Remove 1','Add another'])assert.equal(cartPermission(input),true,input);
 for(const input of ["Don't add one to my cart",'Could I add one to my cart?','Could you explain how to add to cart?','If I remove one from my cart','Maybe add one to my cart'])assert.equal(cartPermission(input),false,input);
});
test('relative quantities and empty requests cannot be mistaken for model totals',()=>{
 for(const [text,start,result] of [['Add two more to my cart',3,5],['Remove one from my cart',3,2],['Clear my cart',7,0],['Remove all units from my cart',7,0],['Set my cart to four',8,4],['Remove ten hangers',3,0],['Add another',2,3]])assert.equal(requestedCartQuantity(text,start,99),result,text);
});

test('natural quantity requests resolve in cart context but never from frame or weight answers',()=>{
 const cart={messages:[{role:'assistant',presentation:'cart',text:'How many hangers would you like?'}]};
 for(const input of ['Make it five','Can you set it to 5?','five please','I want five','Change the quantity to five']){
  assert.equal(cartPermission(input,cart),true,input);assert.equal(requestedCartQuantity(input,2,1,cart),5,input);
  assert.equal(cartPermission(input),false,input);
 }
 for(const input of ['Add five','Please add five','I want five hangers'])assert.equal(cartPermission(input),true,input);
 for(const question of ['How many frames should the preview have?','How many pounds does your frame weigh?']){
  const state={messages:[{role:'assistant',presentation:'cart',text:question}]};
  assert.equal(cartPermission('five',state),false);assert.equal(cartPermission('Make it five',state),false);
 }
 for(const input of ['Maybe make it five','Do not make it five','Could you explain how to set it to five?'])assert.equal(cartPermission(input,cart),false,input);
});

test('just add 20 is explicit and remains a relative addition',()=>{
 for(const input of ['just add 20','Just add twenty.','Can you just add 20?','Please just add twenty','Just add twenty of them.']){
  assert.equal(cartPermission(input),true,input);
  assert.equal(requestedCartQuantity(input,0,1),20,input);
  assert.equal(requestedCartQuantity(input,2,1),22,input);
 }
});
