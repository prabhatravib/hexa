# External Data Endpoint for Hexagon Worker

## Overview

The External Data Endpoint allows you to send any type of external data (images, text, documents, code, etc.) to your Hexagon Worker for voice discussions and AI interactions.

## Endpoint Details

- **URL**: `https://hexa-worker.prabhatravib.workers.dev/api/external-data`
- **Method**: `POST`
- **Content-Type**: `application/json`

## Request Body

The endpoint accepts a flexible JSON payload with the following optional fields:

```json
{
  "image": "data:image/png;base64,...",    // Optional: Base64 encoded image
  "text": "Some text input",                // Optional: Text content
  "prompt": "Context or prompt",            // Optional: Context for AI
  "type": "diagram|document|code|image"     // Optional: Data type identifier
}
```

### Field Descriptions

- **`image`**: Base64 encoded image data (e.g., `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`)
- **`text`**: Any text content you want to discuss (code, documents, notes, etc.)
- **`prompt`**: Context or instructions for how the AI should handle the data
- **`type`**: Optional identifier for the type of data (helps with categorization)

## Response

### Success Response (200)
```json
{
  "success": true,
  "message": "External data received and stored for voice context",
  "sessionId": "uuid-here"
}
```

### Error Responses

#### Method Not Allowed (405)
```json
{
  "success": false,
  "error": "Method not allowed. Use POST."
}
```

#### Server Error (500)
```json
{
  "success": false,
  "error": "Failed to process external data"
}
```

## CORS Support

The endpoint supports CORS and includes proper headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Usage Examples

### 1. Send Text for Discussion

```javascript
const response = await fetch('https://hexa-worker.prabhatravib.workers.dev/api/external-data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'function calculateSum(a, b) { return a + b; }',
    prompt: 'Explain this function and suggest improvements',
    type: 'code'
  })
});

const result = await response.json();
console.log(result);
```

### 2. Send Image for Analysis

```javascript
const response = await fetch('https://hexa-worker.prabhatravib.workers.dev/api/external-data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: 'data:image/png;base64,your_base64_image_data_here',
    prompt: 'Analyze this image and describe what you see',
    type: 'image'
  })
});

const result = await response.json();
console.log(result);
```

### 3. Send Document Content

```javascript
const response = await fetch('https://hexa-worker.prabhatravib.workers.dev/api/external-data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'Project requirements: Build a voice-enabled AI assistant that can process external data and provide contextual responses.',
    prompt: 'Break down these requirements into actionable development tasks',
    type: 'document'
  })
});

const result = await response.json();
console.log(result);
```

## Integration with Voice System

Once external data is received:

1. **Data Storage**: The data is stored in the worker session
2. **Client Notification**: All connected clients receive a notification about the new external data
3. **Voice Context**: The data becomes available for AI voice interactions
4. **Real-time Updates**: Connected clients receive real-time updates about the data

### Client Event Types

When external data is received, clients will receive these events:

- `external_data_received`: Main notification about received data
- `external_data_processed`: Confirmation that data was processed
- `external_text_available`: If text content was provided
- `external_image_available`: If image content was provided

## Testing

Use the provided `test-external-data.js` script to test the endpoint:

```bash
node test-external-data.js
```

## Use Cases

- **Code Review**: Send code snippets for AI analysis and discussion
- **Document Analysis**: Upload documents for AI to process and discuss
- **Image Processing**: Send images for AI to analyze and describe
- **Data Context**: Provide context for voice conversations
- **Learning**: Use as a teaching tool with AI voice assistance

## Security Notes

- The endpoint accepts any JSON payload
- Images are stored as base64 strings (consider size limits)
- All data is stored in the worker session (not persisted to disk)
- CORS is enabled for cross-origin requests

## Error Handling

Always check the response status and handle errors appropriately:

```javascript
try {
  const response = await fetch('https://hexa-worker.prabhatravib.workers.dev/api/external-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(yourData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }
  
  const result = await response.json();
  console.log('Success:', result);
} catch (error) {
  console.error('Error:', error.message);
}
```

## Support

For issues or questions about the External Data Endpoint, check the worker logs or contact the development team.
