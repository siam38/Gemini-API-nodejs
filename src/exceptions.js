// Custom error classes for Gemini API
class GeminiError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GeminiError';
    }
}

class AuthError extends GeminiError {
    constructor(message = 'Authentication failed') {
        super(message);
        this.name = 'AuthError';
    }
}

class APIError extends GeminiError {
    constructor(message) {
        super(message);
        this.name = 'APIError';
    }
}

class TimeoutError extends GeminiError {
    constructor(message) {
        super(message);
        this.name = 'TimeoutError';
    }
}

class ImageGenerationError extends APIError {
    constructor(message) {
        super(message);
        this.name = 'ImageGenerationError';
    }
}

class UsageLimitExceeded extends GeminiError {
    constructor(message) {
        super(message);
        this.name = 'UsageLimitExceeded';
    }
}

class ModelInvalid extends GeminiError {
    constructor(message) {
        super(message);
        this.name = 'ModelInvalid';
    }
}

class TemporarilyBlocked extends GeminiError {
    constructor(message) {
        super(message);
        this.name = 'TemporarilyBlocked';
    }
}

module.exports = {
    GeminiError,
    AuthError,
    APIError,
    TimeoutError,
    ImageGenerationError,
    UsageLimitExceeded,
    ModelInvalid,
    TemporarilyBlocked
};

