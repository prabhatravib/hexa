// static/js/chat.js
// Handles voice transcripts and chat interactions with transcript accumulation

// Chat display for continuous voice interaction
class Chat {
  constructor() {
    this.panel = document.getElementById('chat-panel');
    
    // Transcript accumulation
    this.currentTranscriptBubble = null;
    this.currentTranscriptText = '';
    this.currentItemId = null;

    // Initialize minimize button
    this.setupMinimizeButton();
  }
  
  setupMinimizeButton() {
    const minimizeBtn = document.getElementById('chat-minimize-btn');
    if (!minimizeBtn) {
      // Create the button if it doesn't exist
      const btn = document.createElement('button');
      btn.id = 'chat-minimize-btn';
      btn.className = 'chat-minimize-btn';
      btn.title = 'Minimize chat';
      btn.textContent = '−';
      this.panel.appendChild(btn);
    }
    const button = document.getElementById('chat-minimize-btn');
    let isMinimized = false;
    button.addEventListener('click', () => {
      isMinimized = !isMinimized;
      if (isMinimized) {
        this.panel.classList.add('minimized');
        button.textContent = '+';
        button.title = 'Expand chat';
      } else {
        this.panel.classList.remove('minimized');
        button.textContent = '−';
        button.title = 'Minimize chat';
        // Scroll to bottom when expanding
        setTimeout(() => {
          const lastBubble = this.panel.querySelector('.bubble:last-child');
          if (lastBubble) {
            lastBubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }, 100);
      }
    });
  }

  addBubble(role, text) {
    const div = document.createElement('div');
    div.className = `bubble ${role}`;
    
    const formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    
    div.innerHTML = formattedText;
    this.panel.appendChild(div);
    
    this.panel.style.display = 'block';
    
    setTimeout(() => {
      if (div && div.scrollIntoView) {
        div.scrollIntoView({behavior: 'smooth', block: 'end'});
      }
    }, 100);
    
    return div;
  }
  
  // Handle incremental transcript updates
  updateTranscript(data) {
    const { text, item_id, is_final, role } = data;
    
    // If this is a new item/conversation, start fresh
    if (item_id !== this.currentItemId) {
      this.finalizeCurrentTranscript();
      this.currentItemId = item_id;
      this.currentTranscriptText = '';
    }
    
    // Accumulate or replace text depending on whether this is the final chunk
    if (is_final) {
      // The "done" event from OpenAI includes the *entire* transcript,
      // so we should REPLACE the current text to avoid duplicating the
      // earlier deltas that we have already appended.
      this.currentTranscriptText = text;
    } else {
      // Incremental delta – append only the new chunk
      this.currentTranscriptText += text;
    }
    
    // Create or update the current transcript bubble
    if (!this.currentTranscriptBubble) {
      this.currentTranscriptBubble = this.addBubble(role || 'assistant', '');
      this.currentTranscriptBubble.classList.add('transcript-active');
    }
    
    // Update the bubble content with accumulated text (formatted)
    const formattedText = this.currentTranscriptText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    
    this.currentTranscriptBubble.innerHTML = formattedText;
    
    // If this was the final message, freeze the bubble but DON'T reset tracking yet
    // This prevents duplicate bubbles if additional events arrive
    if (is_final && this.currentTranscriptBubble) {
      this.currentTranscriptBubble.classList.remove('transcript-active');
      // Don't call finalizeCurrentTranscript() here - let the next item trigger it
    }
    
    // Auto-scroll so the latest transcript is visible
    setTimeout(() => {
      if (this.currentTranscriptBubble && this.currentTranscriptBubble.scrollIntoView) {
        this.currentTranscriptBubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 50);
  }
  
  finalizeCurrentTranscript() {
    if (this.currentTranscriptBubble) {
      this.currentTranscriptBubble.classList.remove('transcript-active');
      this.currentTranscriptBubble = null;
    }
    this.currentTranscriptText = '';
    this.currentItemId = null;
  }
  
  // Add a user message (for when user speaks)
  addUserMessage(text) {
    this.addBubble('user', text);
  }
  
  // Clear the chat panel
  clear() {
    this.panel.innerHTML = '';
    this.panel.style.display = 'none';
    this.finalizeCurrentTranscript();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.chatInstance = new Chat();
});

// Add CSS for transcript styling
const style = document.createElement('style');
style.textContent = `
  .bubble.transcript-active {
    opacity: 0.8;
    border-left: 3px solid #4CAF50;
    background: linear-gradient(45deg, #f0f0f0, #f8f8f8);
  }
  
  .bubble.transcript-active::after {
    content: '●';
    color: #4CAF50;
    animation: pulse 1s infinite;
    margin-left: 5px;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
document.head.appendChild(style);