const Endpoint = {
    GOOGLE: "https://www.google.com",
    INIT: "https://gemini.google.com/app",
    GENERATE: "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
    ROTATE_COOKIES: "https://accounts.google.com/RotateCookies",
    UPLOAD: "https://content-push.googleapis.com/upload",
    BATCH_EXEC: "https://gemini.google.com/_/BardChatUi/data/batchexecute"
};

const Headers = {
    GEMINI: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        "Host": "gemini.google.com",
        "Origin": "https://gemini.google.com",
        "Referer": "https://gemini.google.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Same-Domain": "1"
    },
    ROTATE_COOKIES: {
        "Content-Type": "application/json"
    },
    UPLOAD: {
        "Push-ID": "feeds/mcudyrk2a4khkz"
    }
};

const Model = {
    UNSPECIFIED: {
        name: "unspecified",
        header: {"x-goog-ext-525001261-jspb": "[1,null,null,null,\"71c2d248d3b102ff\"]"},
        advancedOnly: false
    },
    G_2_5_FLASH: {
        name: "gemini-2.5-flash",
        header: {"x-goog-ext-525001261-jspb": "[1,null,null,null,\"71c2d248d3b102ff\"]"},
        advancedOnly: false
    },
    G_2_5_PRO: {
        name: "gemini-2.5-pro",
        header: {"x-goog-ext-525001261-jspb": "[1,null,null,null,\"2525e3954d185b3c\"]"},
        advancedOnly: false
    },
    G_2_0_FLASH: {
        name: "gemini-2.0-flash",
        header: {"x-goog-ext-525001261-jspb": "[1,null,null,null,\"f299729663a2343f\"]"},
        advancedOnly: false
    },
    G_2_0_FLASH_THINKING: {
        name: "gemini-2.0-flash-thinking",
        header: {"x-goog-ext-525001261-jspb": "[null,null,null,null,\"7ca48d02d802f20a\"]"},
        advancedOnly: false
    }
};

// Helper function to get model by name
function getModelByName(name) {
    for (const [key, model] of Object.entries(Model)) {
        if (model.name === name) {
            return model;
        }
    }
    throw new Error(`Unknown model name: ${name}. Available models: ${Object.values(Model).map(m => m.name).join(", ")}`);
}

const ErrorCode = {
    USAGE_LIMIT_EXCEEDED: 1037,
    MODEL_HEADER_INVALID: 1052,
    IP_TEMPORARILY_BLOCKED: 1060
};

module.exports = {
    Endpoint,
    Headers,
    Model,
    ErrorCode,
    getModelByName
};

