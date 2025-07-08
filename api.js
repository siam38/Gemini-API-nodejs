const express = require("express");
const cors = require("cors");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { GeminiClient, Model, getModelByName } = require("./index.js");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));


function replaceWithBoldLetters(text) {
  const map = {
    ...Object.fromEntries("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c, i) => [c, String.fromCodePoint(0x1D5D4 + i)])),
    ...Object.fromEntries("abcdefghijklmnopqrstuvwxyz".split("").map((c, i) => [c, String.fromCodePoint(0x1D5EE + i)])),
    ...Object.fromEntries("0123456789".split("").map((c, i) => [c, String.fromCodePoint(0x1D7EC + i)])),
  };
  return text.replace(/[A-Za-z0-9]/g, ch => map[ch] || ch);
}

function formatContent(text) {
  const bolded = text
    .replace(/\*\*(.*?)\*\*/g, (_, group) => `**${replaceWithBoldLetters(group)}**`)
    .replace(/\*\*/g, '');

  const restored = bolded
    .replace(/• (.*?)\n/g, '**$1**\n')
    .replace(/\*/g, '•');

  const noImages = restored.replace(/!\s*\[.*?\]\s*\([^)]+\)/g, '');
  const cleanText = noImages.replace(/\[.*?\]\(.*?\)/g, '');

  return cleanText;
}



async function downloadImage(imageUrl) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 30000
        });
        return Buffer.from(response.data);
    } catch (error) {
        throw new Error(`Failed to download image from ${imageUrl}: ${error.message}`);
    }
}

// Save image temporarily and return path
async function saveImageTemporarily(imageUrl) {
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const imageBuffer = await downloadImage(imageUrl);
    const fileName = `temp_image_${Date.now()}.jpg`;
    const filePath = path.join(tempDir, fileName);
    
    fs.writeFileSync(filePath, imageBuffer);
    return filePath;
}

// Configuration
const secure1PSID = process.env.SECURE_1PSID || "your_default_1PSID";
const secure1PSIDTS = process.env.SECURE_1PSIDTS || "your_default_1PSIDTS";

// Global client instance
let geminiClient = null;
const chatSessions = new Map(); // Store chat sessions by ID

// Initialize Gemini client
async function initializeClient() {
    if (!geminiClient) {
        geminiClient = new GeminiClient(secure1PSID, secure1PSIDTS);
        await geminiClient.init({
            timeout: 60000,
            autoClose: false,
            autoRefresh: true,
            verbose: false
        });
        console.log("✅ Gemini client initialized successfully");
    }
    return geminiClient;
}

// Main API endpoint
app.post("/ask-gemini", async (req, res) => {
    try {
        const { prompt, ids, imageurl, model, gemId } = req.body;

        // Validate required parameters
        if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
            return res.status(400).json({
                error: "Prompt is required and must be a non-empty string"
            });
        }

        // Initialize client if needed
        await initializeClient();

        // Handle model selection
        let selectedModel = Model.UNSPECIFIED;
        if (model) {
            try {
                if (typeof model === "string") {
                    selectedModel = getModelByName(model);
                } else {
                    selectedModel = model;
                }
            } catch (error) {
                return res.status(400).json({
                    error: `Invalid model: ${error.message}`
                });
            }
        }

        // Handle gem selection
        let selectedGem = null;
        if (gemId) {
            try {
                await geminiClient.fetchGems();
                const gems = geminiClient.gems;
                selectedGem = gems.get(gemId);
                if (!selectedGem) {
                    return res.status(400).json({
                        error: `Gem with ID "${gemId}" not found`
                    });
                }
            } catch (error) {
                console.warn("Failed to fetch gems:", error.message);
            }
        }

        // Handle conversation tracking
        let chatSession = null;
        let conversationId = null;

        if (ids) {
            // Parse conversation IDs
            if (typeof ids === "string") {
                conversationId = ids;
            } else if (Array.isArray(ids) && ids.length > 0) {
                conversationId = ids.join("_");
            } else if (typeof ids === "object" && ids.cid) {
                conversationId = ids.cid;
            }

            if (conversationId) {
                // Get existing chat session or create new one
                if (chatSessions.has(conversationId)) {
                    chatSession = chatSessions.get(conversationId);
                } else {
                    chatSession = geminiClient.startChat({
                        model: selectedModel,
                        gem: selectedGem
                    });
                    chatSessions.set(conversationId, chatSession);
                }
            }
        }

        // If no conversation ID provided, create a new one
        if (!chatSession) {
            conversationId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            chatSession = geminiClient.startChat({
                model: selectedModel,
                gem: selectedGem
            });
            chatSessions.set(conversationId, chatSession);
        }

        // Handle image attachment - pass URL directly to client.js
        let files = null;
        let tempFilePath = null;

        if (imageurl) {
            try {
                tempFilePath = await saveImageTemporarily(imageurl);
                files = [tempFilePath];
            } catch (error) {
                return res.status(400).json({
                    error: `Failed to process image: ${error.message}`
                });
            }
        }

        // Generate content
        let response;
        try {
            if (chatSession) {
                response = await chatSession.sendMessage(prompt, files);
            } else {
                response = await geminiClient.generateContent(
                    prompt,
                    files,
                    selectedModel,
                    selectedGem
                );
            }
        } catch (error) {
            throw error; // Re-throw to be caught by outer catch block
        }

        // Process response and upload images to tmpfiles.org
        const attachments = [];

        // Process web images
        if (response.candidates && response.candidates[response.chosen] && response.candidates[response.chosen].webImages) {
            for (const webImage of response.candidates[response.chosen].webImages) {
                attachments.push({
                    type: "web_image",
                    title: webImage.title,
                    alt: webImage.alt,
                    original_url: webImage.url,
                    url: webImage.url // Use original URL directly
                });
            }
        }

        // Process generated images
        if (response.candidates && response.candidates[response.chosen] && response.candidates[response.chosen].generatedImages) {
            for (const genImage of response.candidates[response.chosen].generatedImages) {
                attachments.push({
                    type: "generated_image",
                    title: genImage.title,
                    alt: genImage.alt,
                    original_url: genImage.url, // Original URL from Gemini
                    url: genImage.url // tmpfiles.org URL from client
                });
            }
        }

        // Prepare response
        const apiResponse = {
            success: true,
            conversation_id: conversationId,
            response: {
                text: formatContent(response.text),
                thoughts: response.thoughts || null,
                candidates_count: response.candidates.length,
                model_used: selectedModel.name,
                gem_used: selectedGem ? selectedGem.name : null
            },
            attachments: attachments,
            metadata: {
                chat_metadata: chatSession ? chatSession.metadata : null,
                rcid: response.rcid,
                timestamp: new Date().toISOString()
            }
        };

        res.json(apiResponse);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error.message,
            success: false
        });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        client_initialized: !!geminiClient,
        active_conversations: chatSessions.size
    });
});

// Get available models endpoint
app.get("/models", (req, res) => {
    const models = Object.entries(Model).map(([key, model]) => ({
        key: key,
        name: model.name,
        advanced_only: model.advancedOnly
    }));
    
    res.json({
        success: true,
        models: models
    });
});

// Get available gems endpoint
app.get("/gems", async (req, res) => {
    try {
        await initializeClient();
        await geminiClient.fetchGems();
        const gems = geminiClient.gems;
        
        const systemGems = gems.filter(true).toArray().map(gem => ({
            id: gem.id,
            name: gem.name,
            description: gem.description,
            predefined: gem.predefined
        }));
        
        const customGems = gems.filter(false).toArray().map(gem => ({
            id: gem.id,
            name: gem.name,
            description: gem.description,
            predefined: gem.predefined
        }));
        
        res.json({
            success: true,
            system_gems: systemGems,
            custom_gems: customGems,
            total_count: gems.size
        });
    } catch (error) {
        res.status(500).json({
            error: "Failed to fetch gems",
            message: error.message,
            success: false
        });
    }
});

// Clear conversation endpoint
app.delete("/conversations/:id", (req, res) => {
    const conversationId = req.params.id;
    
    if (chatSessions.has(conversationId)) {
        chatSessions.delete(conversationId);
        res.json({
            success: true,
            message: `Conversation ${conversationId} cleared`
        });
    } else {
        res.status(404).json({
            error: "Conversation not found",
            success: false
        });
    }
});

// List active conversations endpoint
app.get("/conversations", (req, res) => {
    const conversations = Array.from(chatSessions.keys()).map(id => ({
        id: id,
        metadata: chatSessions.get(id).metadata
    }));
    
    res.json({
        success: true,
        conversations: conversations,
        count: conversations.length
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error("Unhandled error:", error);
    res.status(500).json({
        error: "Internal server error",
        message: error.message,
        success: false
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: "Endpoint not found",
        success: false
    });
});

// Start server
app.listen(PORT, "0.0.0.0", async () => {
    console.log(`🚀 Gemini API Server running on http://0.0.0.0:${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   POST /ask-gemini - Main chat endpoint`);
    console.log(`   GET  /health - Health check`);
    console.log(`   GET  /models - Available models`);
    console.log(`   GET  /gems - Available gems`);
    console.log(`   GET  /conversations - List active conversations`);
    console.log(`   DELETE /conversations/:id - Clear conversation`);
    
    // Initialize client on startup
    try {
        await initializeClient();
        console.log("✅ Server ready to accept requests");
    } catch (error) {
        console.error("❌ Failed to initialize Gemini client:", error.message);
        console.log("⚠️ Server started but Gemini client will be initialized on first request");
    }
});

module.exports = app;


