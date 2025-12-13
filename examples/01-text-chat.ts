/**
 * Example 1: Text Chat Conversation
 *
 * This example demonstrates creating a vCon for a simple customer support
 * text chat conversation between an agent and a customer.
 *
 * Key concepts covered:
 * - Creating a new vCon
 * - Adding parties with different identifiers
 * - Creating text dialogs
 * - Adding tags for classification
 * - Serializing to JSON
 */

import { Vcon, Party, Dialog } from '../src';

console.log('=== Example 1: Text Chat Conversation ===\n');

// Step 1: Create a new vCon
const vcon = Vcon.buildNew();
console.log(`Created vCon with UUID: ${vcon.uuid}`);
console.log(`vCon version: ${vcon.vcon}`);
console.log(`Created at: ${vcon.created_at}\n`);

// Step 2: Add the customer party
const customer = new Party({
  tel: '+1-555-123-4567',
  name: 'Alice Johnson',
  role: 'customer',
  timezone: 'America/New_York'
});
vcon.addParty(customer);
console.log('Added customer:', customer.name);

// Step 3: Add the agent party
const agent = new Party({
  mailto: 'support@company.com',
  name: 'Bob Smith',
  role: 'agent',
  timezone: 'America/Los_Angeles'
});
vcon.addParty(agent);
console.log('Added agent:', agent.name);

// Step 4: Create the conversation (simulating a chat)
const conversationMessages = [
  { from: 0, text: "Hi, I'm having trouble logging into my account." },
  { from: 1, text: "Hello Alice! I'd be happy to help you with that. Can you tell me what error message you're seeing?" },
  { from: 0, text: "It says 'Invalid credentials' but I'm sure my password is correct." },
  { from: 1, text: "I understand how frustrating that can be. Let me check your account status." },
  { from: 1, text: "I can see there were multiple failed login attempts. For security, the account was temporarily locked." },
  { from: 0, text: "Oh, that makes sense. How can I unlock it?" },
  { from: 1, text: "I've unlocked it for you now. Please try logging in again, and if it doesn't work, use the 'Forgot Password' link." },
  { from: 0, text: "It worked! Thank you so much for your help!" },
  { from: 1, text: "You're welcome, Alice! Is there anything else I can help you with today?" },
  { from: 0, text: "No, that's all. Thanks again!" }
];

// Add each message as a dialog
let messageTime = new Date();
conversationMessages.forEach((msg, index) => {
  const dialog = new Dialog({
    type: 'text',
    start: messageTime.toISOString(),
    parties: [0, 1],  // Both parties are part of the conversation
    originator: msg.from,  // Who sent this message
    body: msg.text,
    mediatype: 'text/plain',
    encoding: 'none'
  });
  vcon.addDialog(dialog);

  // Simulate time passing between messages (10-30 seconds)
  messageTime = new Date(messageTime.getTime() + (10 + Math.random() * 20) * 1000);
});

console.log(`\nAdded ${conversationMessages.length} dialog messages`);

// Step 5: Set conversation subject and add tags
vcon.subject = 'Account Login Issue - Locked Account';
vcon.addTag('category', 'account-support');
vcon.addTag('resolution', 'resolved');
vcon.addTag('satisfaction', 'positive');

console.log('\nConversation metadata:');
console.log(`  Subject: ${vcon.subject}`);
console.log(`  Tags: ${JSON.stringify(vcon.tags)}`);

// Step 6: Serialize to JSON
const jsonOutput = vcon.toJson();
console.log('\n--- Serialized vCon JSON ---');
console.log(JSON.stringify(JSON.parse(jsonOutput), null, 2));

// Step 7: Demonstrate loading from JSON
console.log('\n--- Loading vCon from JSON ---');
const loadedVcon = Vcon.buildFromJson(jsonOutput);
console.log(`Loaded vCon UUID: ${loadedVcon.uuid}`);
console.log(`Number of parties: ${loadedVcon.parties.length}`);
console.log(`Number of dialogs: ${loadedVcon.dialog.length}`);

// Print conversation summary
console.log('\n--- Conversation Summary ---');
loadedVcon.dialog.forEach((d, i) => {
  const sender = loadedVcon.parties[d.originator as number];
  console.log(`[${i + 1}] ${sender.name}: ${d.body}`);
});

console.log('\n=== Example 1 Complete ===');
