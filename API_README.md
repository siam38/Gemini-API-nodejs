# Gemini API Server

A professional Express.js API server built on top of the Gemini NodeJS wrapper. This server provides a REST API interface to interact with Google Gemini AI with conversation tracking, image processing, and file upload capabilities.

## Features

- **REST API Interface** - Clean HTTP endpoints for Gemini AI interaction
- **Conversation Tracking** - Maintain multi-turn conversations with unique IDs
- **Image Processing** - Handle image URLs as input and upload generated images to temporary storage
- **Model Selection** - Choose between different Gemini models
- **Gem Support** - Use system prompts (Gems) for specialized responses
- **File Upload** - Automatic upload of generated images to `tmpfiles.org`
- **CORS Enabled** - Ready for frontend integration
- **Error Handling** - Comprehensive error responses

## Installation

```bash
npm install
```

## Configuration

Set your Gemini cookies as environment variables:

```bash
export SECURE_1PSID="your_secure_1psid_here"
export SECURE_1PSIDTS="your_secure_1psidts_here"
export PORT=3000  # Optional, defaults to 3000
```

Or modify the default values in `api.js`:

```javascript
const secure1PSID = process.env.SECURE_1PSID || "your_secure_1psid_here";
const secure1PSIDTS = process.env.SECURE_1PSIDTS || "your_secure_1psidts_here";
```

## Starting the Server

```bash
npm run api
# or
node api.js
```

The server will start on `http://0.0.0.0:3000` by default.

## API Endpoints

### POST /ask-gemini

Main endpoint for interacting with Gemini AI.

**Request Body:**
```json
{
  "prompt": "Your question or prompt (required)",
  "ids": "conversation_id (optional)",
  "imageurl": "https://example.com/image.jpg (optional)",
  "model": "gemini-2.5-flash (optional)",
  "gemId": "gem_id_for_system_prompt (optional)"
}
```

**Parameters:**
- `prompt` (string, required): The text prompt to send to Gemini
- `ids` (string/array/object, optional): Conversation ID for multi-turn chats
- `imageurl` (string, optional): URL of an image to analyze
- `model` (string, optional): Model name (see `/models` endpoint)
- `gemId` (string, optional): Gem ID for system prompts (see `/gems` endpoint)

**Response:**
```json
{
  "success": true,
  "conversation_id": "chat_1234567890_abcdef123",
  "response": {
    "text": "AI response text",
    "thoughts": "Model\'s thinking process (if available)",
    "candidates_count": 1,
    "model_used": "gemini-2.5-flash",
    "gem_used": "Gem name or null"
  },
  "attachments": [
    {
      "type": "generated_image",
      "title": "[Generated Image 123456]",
      "alt": "Description of the image",
      "original_url": "https://lh3.googleusercontent.com/...",
      "url": "https://tmpfiles.org/dl/abc123/image.jpg"
    }
  ],
  "metadata": {
    "chat_metadata": [null, null, null],
    "rcid": "response_candidate_id",
    "timestamp": "2025-07-07T20:00:00.000Z"
  }
}
```

**Example Requests:**

1. Simple text generation:
```bash
curl -X POST http://localhost:3000/ask-gemini \
  -H "Content-Type: application/json" \
  -d \'{"prompt": "Hello, how are you?"}\'
```

2. Continue conversation:
```bash
curl -X POST http://localhost:3000/ask-gemini \
  -H "Content-Type: application/json" \
  -d \'{
    "prompt": "What was my previous question?",
    "ids": "chat_1234567890_abcdef123"
  }\'
```

3. Image analysis:
```bash
curl -X POST http://localhost:3000/ask-gemini \
  -H "Content-Type: application/json" \
  -d \'{
    "prompt": "Describe this image",
    "imageurl": "https://example.com/image.jpg"
  }\'
```

4. Image generation:
```bash
curl -X POST http://localhost:3000/ask-gemini \
  -H "Content-Type: application/json" \
  -d \'{"prompt": "Generate an image of a sunset over mountains"}\'
```

5. Model selection:
```bash
curl -X POST http://localhost:3000/ask-gemini \
  -H "Content-Type: application/json" \
  -d \'{
    "prompt": "Explain quantum computing",
    "model": "gemini-2.5-pro"
  }\'
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-07-07T20:00:00.000Z",
  "client_initialized": true,
  "active_conversations": 5
}
```

### GET /models

Get available Gemini models.

**Response:**
```json
{
  "success": true,
  "models": [
    {
      "key": "UNSPECIFIED",
      "name": "unspecified",
      "advanced_only": false
    },
    {
      "key": "G_2_5_FLASH",
      "name": "gemini-2.5-flash",
      "advanced_only": false
    },
    {
      "key": "G_2_5_PRO",
      "name": "gemini-2.5-pro",
      "advanced_only": false
    }
  ]
}
```

### GET /gems

Get available Gemini Gems (system prompts).

**Response:**
```json
{
  "success": true,
  "system_gems": [
    {
      "id": "gem_id_123",
      "name": "Coding partner",
      "description": "A helpful coding assistant",
      "predefined": true
    }
  ],
  "custom_gems": [],
  "total_count": 15
}
```

### GET /conversations

List active conversations.

**Response:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "chat_1234567890_abcdef123",
      "metadata": [null, null, null]
    }
  ],
  "count": 1
}
```

### DELETE /conversations/:id

Clear a specific conversation.

**Response:**
```json
{
  "success": true,
  "message": "Conversation chat_1234567890_abcdef123 cleared"
}
```

## Error Responses

All endpoints return error responses in this format:

```json
{
  "error": "Error description",
  "message": "Detailed error message",
  "success": false
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (endpoint or conversation not found)
- `500` - Internal Server Error

## Image Processing

### Input Images
When you provide an `imageurl` parameter, the URL is passed directly to the Gemini API. Gemini handles the fetching and processing of the image.

### Generated Images
When Gemini generates images:
1. The server downloads the generated image from Google\'s servers, handling redirects and including necessary cookies.
2. It then uploads the downloaded image to `tmpfiles.org` for temporary hosting.
3. The API response includes both the original Googleusercontent URL and the `tmpfiles.org` URL. The `tmpfiles.org` URL provides direct access without further authentication.

## Conversation Management

### Conversation IDs
- If no `ids` parameter is provided, a new conversation is created
- Conversation IDs are in the format: `chat_timestamp_randomstring`
- You can provide `ids` as:
  - String: `"chat_1234567890_abcdef123"`
  - Array: `["chat_1234567890", "abcdef123"]`
  - Object: `{"cid": "chat_1234567890_abcdef123"}`

### Session Persistence
- Conversations are stored in memory on the server
- Sessions persist until the server restarts
- Use the `/conversations` endpoint to list active sessions
- Use the `DELETE /conversations/:id` endpoint to clear specific sessions

## Model Selection

Available models:
- `unspecified` - Default model selection
- `gemini-2.5-flash` - Fast responses, good for most tasks
- `gemini-2.5-pro` - More capable, better for complex tasks
- `gemini-2.0-flash` - Legacy model (deprecated)
- `gemini-2.0-flash-thinking` - Legacy thinking model (deprecated)

## Gem Usage

Gems are system prompts that modify Gemini\'s behavior:
1. First, call `/gems` to get available gems
2. Use the `id` field from the gem you want
3. Include it in the `gemId` parameter of your `/ask-gemini` request

## Rate Limiting and Best Practices

1. **Rate Limiting**: Google may impose rate limits. Space out requests if needed.
2. **Image URLs**: Ensure image URLs are publicly accessible.
3. **Conversation Cleanup**: Clear old conversations to free memory.
4. **Error Handling**: Always check the `success` field in responses.
5. **Timeouts**: Requests may take 30-60 seconds for complex operations.

## Development and Testing

Run the test suite:
```bash
node test_api.js
```

The test suite covers:
- Health checks
- Model listing
- Simple text generation
- Conversation continuation
- Model selection
- Image generation
- Image analysis
- Gem fetching
- Error handling

## Deployment

The server is configured to:
- Listen on `0.0.0.0` for external access
- Support CORS for frontend integration
- Handle large payloads (50MB limit)
- Provide comprehensive error handling

For production deployment:
1. Set proper environment variables
2. Use a process manager like PM2
3. Set up reverse proxy with nginx
4. Configure proper logging
5. Monitor memory usage for conversation storage

## Security Considerations

1. **Cookie Security**: Keep your Gemini cookies secure and rotate them regularly
2. **CORS**: Configure CORS appropriately for your frontend domain
3. **Input Validation**: The server validates all input parameters
4. **File Cleanup**: Temporary files are automatically cleaned up
5. **Memory Management**: Consider implementing conversation cleanup for long-running servers

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Check your `SECURE_1PSID` and `SECURE_1PSIDTS` cookies
2. **Image Download Failures**: Ensure image URLs are publicly accessible.
3. **Model Not Available**: Some models may not be available in all regions
4. **Gem Fetching Failures**: Gems endpoint may fail occasionally, this is normal
5. **Memory Issues**: Clear old conversations if the server runs for extended periods

### Debug Mode

Enable verbose logging by modifying the client initialization in `api.js`:

```javascript
await geminiClient.init({
    timeout: 60000,
    autoClose: false,
    autoRefresh: true,
    verbose: true  // Enable debug logging
});
```

## License

MIT License - see the original Python version for more details.

## Credits

Built on top of the Gemini NodeJS wrapper, which is based on the Python implementation by [HanaokaYuzu](https://github.com/HanaokaYuzu/Gemini-API).



