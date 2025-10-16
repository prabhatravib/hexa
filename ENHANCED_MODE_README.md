# Enhanced Mode - Chat Panel with Dynamic Feature Count Buttons

## Overview

The Enhanced Mode is an advanced version of the Hexa Voice Agent's chat panel that includes **dynamic numbered aspect buttons** (2-10 configurable) for organizing conversations by different contexts or features. The system supports **PostMessage communication** for iframe integration, allowing parent websites to dynamically control the number of aspect buttons.

## What is Enhanced Mode?

Enhanced Mode transforms the standard chat panel by adding:

- **Dynamic Aspect Selection Buttons** (numbered 1-N, where N is 2-10) in the chat panel header
- **Per-aspect message organization** - each aspect maintains its own conversation history
- **Context isolation** - conversations in different aspects are kept separate
- **Visual indicators** - active aspect is highlighted with blue background and scale effect
- **PostMessage API** - parent websites can control aspect count via iframe communication
- **Real-time updates** - aspect count can be changed dynamically without page reload

## How It Works

### URL-Based Routing

The enhanced mode is activated through **URL routing**:

- **Normal Mode**: `https://hexa-worker.prabhatravib.workers.dev/`
- **Enhanced Mode**: `https://hexa-worker.prabhatravib.workers.dev/enhancedMode`

### PostMessage Communication

The system supports **dynamic aspect count control** via PostMessage API:

```javascript
// Parent website sends aspect count to iframe
iframe.contentWindow.postMessage({
  type: 'SET_ASPECT_COUNT',
  aspectCount: 5  // 2-10 range
}, 'https://hexa-worker.prabhatravib.workers.dev');
```

### Technical Implementation

1. **URL Detection**: The React app detects if "enhancedMode" is in the URL path
2. **PostMessage Listener**: Listens for `SET_ASPECT_COUNT` messages from parent websites
3. **Dynamic Rendering**: Aspect buttons are generated dynamically based on received count
4. **State Management**: Each aspect (1-N) maintains separate:
   - Voice message history
   - Text message history
   - Conversation context
5. **Validation**: Aspect count is validated (2-10 range) with fallback to default (7)

## Features

### Aspect Selection UI
```
┌─────────────────────────────────────┐
│  🎤 Voice chat  💬 Text chat       │  ← Tabs (unchanged)
├─────────────────────────────────────┤
│  [1] [2] [3] [4] [5] [6] [7] [8]    │  ← Dynamic aspect buttons (2-10)
│  ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲ ▲  │
│  1 2 3 4 5 6 7 8 ← Active aspect     │
└─────────────────────────────────────┘
```

### Dynamic Button Generation
- **Default Count**: 7 buttons (maintains backward compatibility)
- **Configurable Range**: 2-10 buttons via PostMessage
- **Single Row Layout**: All buttons fit in one row regardless of count
- **Real-time Updates**: Buttons update immediately when count changes
- **State Preservation**: Existing messages are preserved when count changes

### Visual States
- **Active Aspect**: Blue background, white text, shadow, scale effect
- **Inactive Aspects**: Gray background, hover effects
- **Status Text**: Shows "Enhanced Mode - Ready" when active

## Usage Examples

### Basic Usage (Normal Mode)
```tsx
<ChatPanel
  transcript={transcript}
  response={response}
  onSendMessage={handleSendMessage}
  isAgentReady={isReady}
/>
// Shows standard chat panel without aspect buttons
```

### Enhanced Mode (Default 7 Buttons)
```tsx
<ChatPanel
  transcript={transcript}
  response={response}
  onSendMessage={handleSendMessage}
  isAgentReady={isReady}
  enhancedMode={true}
/>
// Shows chat panel with 1-7 aspect selection buttons
```

### Dynamic Aspect Count via PostMessage
```javascript
// Parent website controls aspect count
const iframe = document.getElementById('hexa-iframe');

// Set 5 aspect buttons
iframe.contentWindow.postMessage({
  type: 'SET_ASPECT_COUNT',
  aspectCount: 5
}, 'https://hexa-worker.prabhatravib.workers.dev');

// Set 8 aspect buttons
iframe.contentWindow.postMessage({
  type: 'SET_ASPECT_COUNT',
  aspectCount: 8
}, 'https://hexa-worker.prabhatravib.workers.dev');
```

### Iframe Integration
```html
<!-- Basic iframe with default 7 buttons -->
<iframe 
  src="https://hexa-worker.prabhatravib.workers.dev/enhancedMode"
  width="400" 
  height="600">
</iframe>

<!-- Dynamic control via JavaScript -->
<script>
const iframe = document.getElementById('hexa-iframe');
iframe.contentWindow.postMessage({
  type: 'SET_ASPECT_COUNT',
  aspectCount: 6
}, 'https://hexa-worker.prabhatravib.workers.dev');
</script>
```

## Implementation Details

### File Structure
```
src/
├── components/
│   └── ChatPanel.tsx           # Main component with enhanced mode logic
├── App.tsx                     # URL detection and enhancedMode prop passing
└── worker-voice/
    └── index.ts                # SPA routing for /enhancedMode URL
```

### Key Components

#### URL Detection & PostMessage Listener (App.tsx)
```typescript
// URL detection for enhanced mode
const checkEnhancedMode = () => {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const enhancedModeDetected = pathSegments.includes('enhancedMode');
  setIsEnhancedMode(enhancedModeDetected);
};

// PostMessage listener for dynamic aspect count
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'SET_ASPECT_COUNT') {
      const count = event.data.aspectCount;
      // Validate count is between 2-10
      if (count >= 2 && count <= 10) {
        setAspectCount(count);
      }
    }
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

#### Dynamic Enhanced Mode Logic (ChatPanel.tsx)
```typescript
// Dynamic aspect count prop
interface ChatPanelProps {
  // ... other props
  aspectCount?: number; // Number of aspect buttons (2-10, default 7)
}

// Dynamic state initialization
const [aspectMessages, setAspectMessages] = useState<Record<AspectNumber, AspectMessages>>(() => {
  const messages: Record<AspectNumber, AspectMessages> = {} as Record<AspectNumber, AspectMessages>;
  for (let i = 1; i <= aspectCount; i++) {
    messages[i as AspectNumber] = { voice: [], text: [] };
  }
  return messages;
});

// Dynamic button generation
{Array.from({ length: aspectCount }, (_, i) => i + 1).map(aspectNum => (
  <button
    key={aspectNum}
    onClick={() => setActiveAspect(aspectNum as AspectNumber)}
    className={/* styling */}
  >
    {aspectNum}
  </button>
))}
```

#### SPA Routing (worker-voice/index.ts)
```typescript
// Serve React app for all non-API routes
return new Response(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="root"></div>
      <script src="/assets/index-BxuuT1Jk.js"></script>
    </body>
  </html>
`);
```

## Benefits

1. **Context Separation**: Keep different types of conversations isolated
2. **Organization**: Logical grouping of related discussions
3. **User Experience**: Clear visual indication of active context
4. **Flexibility**: Easy switching between conversation contexts
5. **Scalability**: Support for 2-10 different aspects/contexts
6. **Iframe Integration**: Perfect for embedding in parent websites
7. **Dynamic Configuration**: Real-time aspect count changes without redeployment
8. **PostMessage API**: Standard web communication protocol for iframe control
9. **Backward Compatibility**: Default 7-button behavior maintained
10. **State Preservation**: Messages preserved when aspect count changes

## Browser Compatibility

- Works with browser back/forward navigation
- Maintains aspect state during navigation
- Supports all modern browsers with JavaScript enabled
- PostMessage API support (IE9+, all modern browsers)
- Cross-origin iframe communication support
- Real-time aspect count updates without page reload

## Deployment

The enhanced mode is deployed alongside the normal mode:
- Both modes use the same Cloudflare Worker
- Same Durable Objects for voice session management
- Separate static asset handling for SPA routing
- PostMessage functionality works immediately after deployment
- No additional configuration required for iframe integration

## Testing

### PostMessage Testing
A test file `test-postmessage.html` is provided for testing the dynamic aspect count feature:

```html
<!-- Test different aspect counts -->
<button onclick="sendAspectCount(2)">Set 2 Buttons</button>
<button onclick="sendAspectCount(5)">Set 5 Buttons</button>
<button onclick="sendAspectCount(10)">Set 10 Buttons</button>

<!-- Test validation -->
<button onclick="sendAspectCount(1)">Test Invalid: 1</button>
<button onclick="sendAspectCount(15)">Test Invalid: 15</button>
```

### Validation Testing
- **Valid Range**: 2-10 buttons work correctly
- **Invalid Range**: Values outside 2-10 fallback to default (7)
- **Real-time Updates**: Buttons update immediately when count changes
- **State Preservation**: Existing messages preserved during count changes

## Future Enhancements

Potential improvements could include:
- Custom aspect labels/names
- Aspect persistence across sessions
- Aspect-specific AI behavior/personas
- Drag & drop aspect reordering
- Aspect templates for common use cases
- **PostMessage Security**: Origin validation for enhanced security
- **Aspect Count Persistence**: Remember aspect count across page reloads
- **Multi-row Layout**: Support for aspect counts > 10 with wrapping
- **Aspect Export/Import**: Save and restore aspect configurations
- **Dynamic Aspect Labels**: Custom names for each aspect button

---

**Note**: The enhanced mode maintains full compatibility with all existing voice agent features while adding the organizational benefits of aspect-based conversation management. The dynamic aspect count feature via PostMessage makes it perfect for iframe integration in parent websites, allowing real-time customization without redeployment.

## API Reference

### PostMessage API

#### Message Format
```typescript
interface SetAspectCountMessage {
  type: 'SET_ASPECT_COUNT';
  aspectCount: number; // 2-10 range
}
```

#### Response Behavior
- **Valid Count (2-10)**: Updates aspect count immediately
- **Invalid Count (< 2 or > 10)**: Ignores message, maintains current count
- **No Response**: Messages are one-way communication
- **Console Logging**: All PostMessage events are logged for debugging

#### Security Considerations
- **No Origin Validation**: Currently accepts messages from any origin
- **Input Validation**: Aspect count is validated before processing
- **Error Handling**: Invalid messages are logged but don't cause errors
