import chalk from 'chalk';

/**
 * Renders streaming events from the Anthropic API to the terminal.
 */
export function createRenderer() {
  let currentBlockType = null;
  let thinkingActive = false;

  return { processEvent, renderToolUse, renderToolResult, renderError, newLine };

  function processEvent(event) {
    switch (event.type) {
      case 'content_block_start':
        handleBlockStart(event);
        break;
      case 'content_block_delta':
        handleDelta(event);
        break;
      case 'content_block_stop':
        handleBlockStop();
        break;
      case 'message_complete':
        // Final message — nothing to render
        break;
    }
  }

  function handleBlockStart(event) {
    const block = event.content_block;
    currentBlockType = block.type;

    if (block.type === 'thinking') {
      thinkingActive = true;
      process.stderr.write(chalk.dim('  thinking...'));
    }
  }

  function handleDelta(event) {
    const delta = event.delta;

    if (delta.type === 'thinking_delta') {
      // Don't render thinking content by default
      return;
    }

    if (delta.type === 'text_delta') {
      process.stdout.write(delta.text);
    }
  }

  function handleBlockStop() {
    if (thinkingActive) {
      // Clear thinking indicator
      process.stderr.write('\r\x1b[K');
      thinkingActive = false;
    }
    currentBlockType = null;
  }

  function renderToolUse(name, input) {
    process.stderr.write(chalk.cyan(`  ● ${name}`));
    // Show brief summary of input
    const summary = summarizeInput(name, input);
    if (summary) process.stderr.write(chalk.dim(` ${summary}`));
    process.stderr.write('\n');
  }

  function renderToolResult(name, result, isError) {
    if (isError) {
      process.stderr.write(chalk.red(`  ✗ ${name} failed\n`));
    }
    // Successful results don't need a separate line — the assistant will reference them
  }

  function renderError(error) {
    process.stderr.write(chalk.red(`\nError: ${error.message}\n`));
  }

  function newLine() {
    process.stdout.write('\n');
  }
}

function summarizeInput(toolName, input) {
  if (!input) return '';
  if (input.command) return truncate(input.command, 60);
  if (input.file_path) return input.file_path;
  if (input.path) return input.path;
  if (input.pattern) return input.pattern;
  if (input.query) return truncate(input.query, 60);
  if (input.url) return truncate(input.url, 60);
  return '';
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
