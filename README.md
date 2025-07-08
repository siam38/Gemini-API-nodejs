# Gemini API NodeJS Wrapper

A reverse-engineered NodeJS wrapper for [Google Gemini](https://gemini.google.com) web app (formerly Bard). This is a port of the Python version by [HanaokaYuzu](https://github.com/HanaokaYuzu/Gemini-API).

## Features

- **Persistent Cookies** - Automatically refreshes cookies in background. Optimized for always-on services.
- **Image Generation** - Natively supports generating and modifying images with natural language.
- **System Prompt** - Supports customizing model's system prompt with [Gemini Gems](https://gemini.google.com/gems/view).
- **Extension Support** - Supports generating contents with [Gemini extensions](https://gemini.google.com/extensions) on, like YouTube and Gmail.
- **Classified Outputs** - Categorizes texts, thoughts, web images and AI generated images in the response.
- **Official Flavor** - Provides a simple and elegant interface inspired by [Google Generative AI](https://ai.google.dev/tutorials/python_quickstart)'s official API.
- **Asynchronous** - Utilizes async/await to run generating tasks and return outputs efficiently.

## Installation

```bash
npm install
```

## Authentication

- Go to <https://gemini.google.com> and login with your Google account
- Press F12 for web inspector, go to `Network` tab and refresh the page
- Click any request and copy cookie values of `__Secure-1PSID` and `__Secure-1PSIDTS`

## Usage

### Basic Example

```javascript
const { GeminiClient, Model } = require('./src/index.js');

const secure1PSID = 'your_secure_1psid_here';
const secure1PSIDTS = 'your_secure_1psidts_here';

async function main() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init({ timeout: 30000, autoClose: false, autoRefresh: true });

    // Simple content generation
    const response = await client.generateContent("Hello World!");
    console.log(response.text);

    await client.close();
}

main();
```

### Multi-turn Conversations

```javascript
const { GeminiClient } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function chatExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    const chat = client.startChat();
    const response1 = await chat.sendMessage("My name is John. Remember this.");
    console.log(response1.text);
    
    const response2 = await chat.sendMessage("What is my name?");
    console.log(response2.text);

    await client.close();
}
```

### Model Selection

```javascript
const { GeminiClient, Model } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function modelExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    // Using specific model
    const response = await client.generateContent(
        "Explain quantum computing", 
        null, 
        Model.G_2_5_PRO
    );
    console.log(response.text);

    await client.close();
}
```

### Using Gemini Gems (System Prompts)

```javascript
const { GeminiClient } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function gemExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    // Fetch available gems
    await client.fetchGems();
    const gems = client.gems;
    const systemGems = gems.filter(true); // predefined gems
    
    if (systemGems.size > 0) {
        const codingPartner = systemGems.get(null, 'Coding partner');
        if (codingPartner) {
            const response = await client.generateContent(
                "Help me write a function to sort an array",
                null,
                Model.G_2_5_FLASH,
                codingPartner
            );
            console.log(response.text);
        }
    }

    await client.close();
}
```

### Image Generation

```javascript
const { GeminiClient } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function imageExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    const response = await client.generateContent("Generate a picture of a cat");
    console.log(response.text);
    
    if (response.generatedImages.length > 0) {
        console.log('Generated images:');
        for (const image of response.generatedImages) {
            console.log(`- ${image.title}: ${image.url}`);
            // Save image locally (example, requires fs and axios)
            // const axios = require('axios');
            // const fs = require('fs');
            // const imageBuffer = await axios.get(image.url, { responseType: 'arraybuffer' });
            // fs.writeFileSync(`./${image.title}.jpg`, imageBuffer.data);
        }
    }

    await client.close();
}
```

### Using Extensions

```javascript
const { GeminiClient } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function extensionExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    // YouTube extension
    const response1 = await client.generateContent("@YouTube What are popular videos today?");
    console.log(response1.text);

    // Gmail extension
    const response2 = await client.generateContent("@Gmail What's in my latest emails?");
    console.log(response2.text);

    await client.close();
}
```

### File Upload (Local Files)

```javascript
const { GeminiClient } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function fileExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    // For local files, provide the path
    const response = await client.generateContent(
        "Analyze this image and document",
        ['./path/to/image.jpg', './path/to/document.pdf']
    );
    console.log(response.text);

    await client.close();
}
```

### Handling Multiple Candidates

```javascript
const { GeminiClient } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function candidateExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    const chat = client.startChat();
    const response = await chat.sendMessage("Tell me a creative story");
    
    console.log('Number of candidates:', response.candidates.length);
    console.log('Default response:', response.text);
    
    if (response.candidates.length > 1) {
        // Switch to different candidate
        const newResponse = chat.chooseCandidate(1);
        console.log('Alternative response:', newResponse.text);
    }

    await client.close();
}
```

### Retrieving Thoughts (Thinking Models)

```javascript
const { GeminiClient, Model } = require('./src/index.js');

// ... (secure1PSID and secure1PSIDTS setup)

async function thoughtsExample() {
    const client = new GeminiClient(secure1PSID, secure1PSIDTS);
    await client.init();

    const response = await client.generateContent(
        "What's 2+2? Think step by step.",
        null,
        Model.G_2_5_PRO
    );
    
    console.log('Response:', response.text);
    if (response.thoughts) {
        console.log('Thoughts:', response.thoughts);
    }

    await client.close();
}
```

## API Reference

### GeminiClient

#### Constructor
```javascript
new GeminiClient(secure1PSID, secure1PSIDTS, proxy, options)
```

#### Methods

- `init(options)` - Initialize the client
- `generateContent(prompt, files, model, gem, chat)` - Generate content
- `startChat(options)` - Start a new chat session
- `fetchGems()` - Fetch available gems
- `close(delay)` - Close the client

### ChatSession

#### Methods

- `sendMessage(prompt, files)` - Send a message in the chat
- `chooseCandidate(index)` - Choose a different response candidate

### Models

Available models:
- `Model.UNSPECIFIED` - Default model
- `Model.G_2_5_FLASH` - Gemini 2.5 Flash
- `Model.G_2_5_PRO` - Gemini 2.5 Pro
- `Model.G_2_0_FLASH` - Gemini 2.0 Flash (deprecated)
- `Model.G_2_0_FLASH_THINKING` - Gemini 2.0 Flash Thinking (deprecated)

## Error Handling

The wrapper includes comprehensive error handling:

```javascript
const { 
    AuthError, 
    APIError, 
    TimeoutError, 
    UsageLimitExceeded,
    ModelInvalid,
    TemporarilyBlocked 
} = require('./src/exceptions.js');

try {
    const response = await client.generateContent("Hello");
    console.log(response.text);
} catch (error) {
    if (error instanceof AuthError) {
        console.error('Authentication failed:', error.message);
    } else if (error instanceof UsageLimitExceeded) {
        console.error('Usage limit exceeded:', error.message);
    } else if (error instanceof TimeoutError) {
        console.error('Request timed out:', error.message);
    } else {
        console.error('Other error:', error.message);
    }
}
```

## Testing

Run the test suite:

```bash
npm test
```

The test suite covers:
- Client initialization
- Content generation
- Multi-turn conversations
- Model selection
- Gem fetching and usage
- Image generation
- Extension usage
- Multiple candidates
- Thoughts retrieval

## Environment Variables

You can set your cookies as environment variables:

```bash
export SECURE_1PSID="your_secure_1psid_here"
export SECURE_1PSIDTS="your_secure_1psidts_here"
```

Then use them in your code:

```javascript
const secure1PSID = process.env.SECURE_1PSID;
const secure1PSIDTS = process.env.SECURE_1PSIDTS;
```

## Important Notes

1. **Cookie Expiration**: The `__Secure-1PSIDTS` cookie expires frequently. The wrapper automatically refreshes it in the background.

2. **Rate Limiting**: Google may impose rate limits. Use appropriate delays between requests if needed.

3. **Image Generation**: Image generation availability varies by region and account type.

4. **Extensions**: Extensions must be activated on the Gemini website before using them via the API.

## License

MIT License - see the original Python version for more details.

## Credits

This NodeJS wrapper is based on the excellent Python implementation by [HanaokaYuzu](https://github.com/HanaokaYuzu/Gemini-API).



