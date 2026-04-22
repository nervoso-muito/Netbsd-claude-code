/**
 * Immutable conversation state management.
 * All functions return new arrays — never mutate.
 */

export function createConversation() {
  return Object.freeze([]);
}

export function addUserMessage(conversation, text) {
  return Object.freeze([
    ...conversation,
    { role: 'user', content: text },
  ]);
}

export function addUserMessageWithContent(conversation, content) {
  return Object.freeze([
    ...conversation,
    { role: 'user', content },
  ]);
}

export function addAssistantMessage(conversation, content) {
  return Object.freeze([
    ...conversation,
    { role: 'assistant', content },
  ]);
}

export function addToolResult(conversation, toolUseId, content, isError = false) {
  const lastMsg = conversation[conversation.length - 1];

  // If last message is user with tool_result content, append to it
  if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content) &&
      lastMsg.content.every(b => b.type === 'tool_result')) {
    const newContent = [...lastMsg.content, { type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }];
    return Object.freeze([
      ...conversation.slice(0, -1),
      { role: 'user', content: newContent },
    ]);
  }

  return Object.freeze([
    ...conversation,
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }],
    },
  ]);
}

export function getLastAssistantContent(conversation) {
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i].role === 'assistant') return conversation[i].content;
  }
  return null;
}
