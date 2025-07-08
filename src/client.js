const axios = require("axios");
const { Endpoint, Headers, Model, getModelByName, ErrorCode } = require("./constants.js");
const {
    AuthError,
    APIError,
    TimeoutError,
    ImageGenerationError,
    UsageLimitExceeded,
    ModelInvalid,
    TemporarilyBlocked,
    GeminiError
} = require("./exceptions.js");
const {
    WebImage,
    GeneratedImage,
    Candidate,
    ModelOutput,
    Gem,
    GemJar
} = require("./types.js");
const {
    uploadFile,
    parseFileName,
    rotate1PSIDTS,
    getAccessToken,
    sleep,
    Logger
} = require("./utils.js");

// Upload file to tmpfiles.org and return URL
async function uploadAndFormatFile(buf, name = "combined.jpg") {
    const FormData = require("form-data");
    const fd = new FormData();
    fd.append("file", buf, { filename: name });
    const res = await axios.post("https://tmpfiles.org/api/v1/upload", fd, { 
        headers: fd.getHeaders() 
    });
    const url = res.data?.data?.url;
    if (!url) throw new Error("Upload failed to tmpfiles.org");
    return url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
}

class GeminiClient {
    constructor(secure1PSID = null, secure1PSIDTS = null, proxy = null, options = {}) {
        this.cookies = {};
        this.proxy = proxy;
        this.isRunning = false;
        this.accessToken = null;
        this.timeout = 30000; // 30 seconds default
        this.autoClose = false;
        this.closeDelay = 300000; // 5 minutes
        this.closeTask = null;
        this.autoRefresh = true;
        this.refreshInterval = 540000; // 9 minutes
        this.refreshTask = null;
        this._gems = null;
        this.options = options;

        // Validate cookies
        if (secure1PSID) {
            this.cookies["__Secure-1PSID"] = secure1PSID;
            if (secure1PSIDTS) {
                this.cookies["__Secure-1PSIDTS"] = secure1PSIDTS;
            }
        } else {
            throw new Error("secure1PSID is required");
        }
    }

    async _runningWrapper(func, retry = 0) {
        try {
            if (!this.isRunning) {
                await this.init({
                    timeout: this.timeout,
                    autoClose: this.autoClose,
                    closeDelay: this.closeDelay,
                    autoRefresh: this.autoRefresh,
                    refreshInterval: this.refreshInterval,
                    verbose: false
                });
                
                if (!this.isRunning) {
                    throw new APIError(`Invalid function call. Client initialization failed.`);
                }
            }
            
            return await func.call(this); // Ensure 'this' context is passed
        } catch (error) {
            if (error instanceof APIError) {
                // Image generation takes too long, only retry once
                if (error instanceof ImageGenerationError) {
                    const actualRetry = Math.min(1, retry);
                    if (actualRetry > 0) {
                        await sleep(1000);
                        return await this._runningWrapper(func, actualRetry - 1);
                    }
                } else if (retry > 0) {
                    await sleep(1000);
                    return await this._runningWrapper(func, retry - 1);
                }
            }
            throw error;
        }
    }

    async init(options = {}) {
        const {
            timeout = 30000,
            autoClose = false,
            closeDelay = 300000,
            autoRefresh = true,
            refreshInterval = 540000,
            verbose = true
        } = options;

        try {
            const [accessToken, validCookies] = await getAccessToken(this.cookies, this.proxy, verbose);

            this.accessToken = accessToken;
            this.cookies = validCookies;
            this.isRunning = true;
            this.timeout = timeout;
            this.autoClose = autoClose;
            this.closeDelay = closeDelay;
            this.autoRefresh = autoRefresh;
            this.refreshInterval = refreshInterval;

            if (this.autoClose) {
                await this.resetCloseTask();
            }

            if (this.autoRefresh) {
                this.startAutoRefresh();
            }

            if (verbose) {
                Logger.success("Gemini client initialized successfully.");
            }
        } catch (error) {
            await this.close();
            throw error;
        }
    }

    async close(delay = 0) {
        if (delay > 0) {
            await sleep(delay);
        }

        this.isRunning = false;

        if (this.closeTask) {
            clearTimeout(this.closeTask);
            this.closeTask = null;
        }

        if (this.refreshTask) {
            clearInterval(this.refreshTask);
            this.refreshTask = null;
        }
    }

    async resetCloseTask() {
        if (this.closeTask) {
            clearTimeout(this.closeTask);
            this.closeTask = null;
        }
        this.closeTask = setTimeout(() => this.close(), this.closeDelay);
    }

    startAutoRefresh() {
        if (this.refreshTask) {
            clearInterval(this.refreshTask);
        }

        this.refreshTask = setInterval(async () => {
            try {
                const new1PSIDTS = await rotate1PSIDTS(this.cookies, this.proxy);
                if (new1PSIDTS) {
                    this.cookies["__Secure-1PSIDTS"] = new1PSIDTS;
                    Logger.debug(`Cookies refreshed. New __Secure-1PSIDTS: ${new1PSIDTS}`);
                }
            } catch (error) {
                if (error instanceof AuthError) {
                    clearInterval(this.refreshTask);
                    this.refreshTask = null;
                    Logger.warning("Failed to refresh cookies. Background auto refresh task canceled.");
                }
            }
        }, this.refreshInterval);
    }

    get gems() {
        if (this._gems === null) {
            throw new Error("Gems not fetched yet. Call GeminiClient.fetchGems() method to fetch gems from gemini.google.com.");
        }
        return this._gems;
    }

    async fetchGems() {
        return this._runningWrapper(async () => {
            try {
                const cookieString = Object.entries(this.cookies)
                    .map(([key, value]) => `${key}=${value}`)
                    .join("; ");

                const config = {
                    method: "post",
                    url: Endpoint.BATCH_EXEC,
                    headers: {
                        ...Headers.GEMINI,
                        "Cookie": cookieString
                    },
                    data: new URLSearchParams({
                        "at": this.accessToken,
                        "f.req": JSON.stringify([
                            [
                                ["CNgdBe", "[2,[\"en\"],0]", null, "custom"],
                                ["CNgdBe", "[3,[\"en\"],0]", null, "system"]
                            ]
                        ])
                    }),
                    timeout: this.timeout
                };

                if (this.proxy) {
                    config.proxy = this.proxy;
                }

                const response = await axios(config);

                if (response.status !== 200) {
                    throw new APIError(`Failed to fetch gems. Request failed with status code ${response.status}`);
                }

                const responseLines = response.data.split("\n");
                const responseJson = JSON.parse(responseLines[2]);

                let predefinedGems = [];
                let customGems = [];

                for (const part of responseJson) {
                    if (part[part.length - 1] === "system") {
                        predefinedGems = JSON.parse(part[2])[2];
                    } else if (part[part.length - 1] === "custom") {
                        const customGemsContainer = JSON.parse(part[2]);
                        if (customGemsContainer) {
                            customGems = customGemsContainer[2];
                        }
                    }
                }

                if (!predefinedGems && !customGems) {
                    throw new Error("No gems found in response");
                }

                const allGems = [];

                // Process predefined gems
                for (const gem of predefinedGems) {
                    allGems.push([
                        gem[0],
                        new Gem(
                            gem[0],
                            gem[1][0],
                            gem[1][1],
                            gem[2] && gem[2][0] || null,
                            true
                        )
                    ]);
                }

                // Process custom gems
                for (const gem of customGems) {
                    allGems.push([
                        gem[0],
                        new Gem(
                            gem[0],
                            gem[1][0],
                            gem[1][1],
                            gem[2] && gem[2][0] || null,
                            false
                        )
                    ]);
                }

                this._gems = new GemJar(allGems);
                return this._gems;

            } catch (error) {
                if (error.code === "ECONNABORTED") {
                    throw new TimeoutError("Fetch gems request timed out, please try again. If the problem persists, consider setting a higher timeout value when initializing GeminiClient.");
                }
                
                await this.close();
                Logger.debug(`Invalid response: ${error.response?.data || error.message}`);
                throw new APIError("Failed to fetch gems. Invalid response data received. Client will try to re-initialize on next request.");
            }
        }, 2);
    }

    async generateContent(prompt, files = null, model = Model.UNSPECIFIED, gem = null, chat = null) {
        return this._runningWrapper(async () => {
            if (!prompt) {
                throw new Error("Prompt cannot be empty.");
            }

            // Handle model parameter
            let selectedModel = model;
            if (typeof model === "string") {
                selectedModel = getModelByName(model);
            }

            // Handle gem parameter
            let gemId = null;
            if (gem) {
                gemId = typeof gem === "string" ? gem : gem.id;
            }

            if (this.autoClose) {
                await this.resetCloseTask();
            }

            try {
                const cookieString = Object.entries(this.cookies)
                    .map(([key, value]) => `${key}=${value}`)
                    .join("; ");

                // Prepare request data
                let requestData = [prompt];
                
                // Handle file uploads (for local files) or pass URLs directly
                if (files && files.length > 0) {
                    const processedFiles = [];
                    for (const file of files) {
                        // Check if it's a URL or a local file path
                        if (file.startsWith("http://") || file.startsWith("https://")) {
                            // For web images, pass the URL directly to Gemini
                            processedFiles.push([
                                [file],
                                "image/jpeg" // Assuming image/jpeg for simplicity, can be improved
                            ]);
                        } else {
                            // For local files, upload them
                            const uploadResult = await uploadFile(file, this.proxy);
                            processedFiles.push([
                                [uploadResult],
                                parseFileName(file)
                            ]);
                        }
                    }
                    requestData = [
                        prompt,
                        0,
                        null,
                        processedFiles
                    ];
                }

                // Prepare full request payload
                let fullRequestData = [
                    requestData,
                    null,
                    chat && chat.metadata
                ];

                // Add gem if specified
                if (gemId) {
                    fullRequestData = fullRequestData.concat(new Array(16).fill(null)).concat([gemId]);
                }

                const config = {
                    method: "post",
                    url: Endpoint.GENERATE,
                    headers: {
                        ...Headers.GEMINI,
                        ...selectedModel.header,
                        "Cookie": cookieString
                    },
                    data: new URLSearchParams({
                        "at": this.accessToken,
                        "f.req": JSON.stringify([
                            null,
                            JSON.stringify(fullRequestData)
                        ])
                    }),
                    timeout: this.timeout
                };

                if (this.proxy) {
                    config.proxy = this.proxy;
                }

                const response = await axios(config);

                if (response.status !== 200) {
                    await this.close();
                    throw new APIError(`Failed to generate contents. Request failed with status code ${response.status}`);
                }

                // Parse response
                const responseLines = response.data.split("\n");
                const responseJson = JSON.parse(responseLines[2]);

                let body = null;
                let bodyIndex = 0;

                for (let partIndex = 0; partIndex < responseJson.length; partIndex++) {
                    try {
                        const mainPart = JSON.parse(responseJson[partIndex][2]);
                        if (mainPart[4]) {
                            bodyIndex = partIndex;
                            body = mainPart;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                if (!body) {
                    await this.close();
                    
                    try {
                        const errorCode = responseJson[0][5][2][0][1][0];
                        switch (errorCode) {
                            case ErrorCode.USAGE_LIMIT_EXCEEDED:
                                throw new UsageLimitExceeded(`Failed to generate contents. Usage limit of ${selectedModel.name} model has exceeded. Please try switching to another model.`);
                            case ErrorCode.MODEL_HEADER_INVALID:
                                throw new ModelInvalid("Failed to generate contents. The specified model is not available. Please update gemini_webapi to the latest version.");
                            case ErrorCode.IP_TEMPORARILY_BLOCKED:
                                throw new TemporarilyBlocked("Failed to generate contents. Your IP address is temporarily blocked by Google. Please try using a proxy or waiting for a while.");
                            default:
                                throw new Error("Unknown error code");
                        }
                    } catch (error) {
                        if (error instanceof GeminiError) {
                            throw error;
                        }
                        Logger.debug(`Invalid response: ${response.data}`);
                        throw new APIError("Failed to generate contents. Invalid response data received. Client will try to re-initialize on next request.");
                    }
                }

                // Parse candidates
                const candidates = [];
                for (let candidateIndex = 0; candidateIndex < body[4].length; candidateIndex++) {
                    const candidate = body[4][candidateIndex];
                    let text = candidate[1][0];
                    
                    // Handle special text formats
                    if (text.match(/^http:\/\/googleusercontent\.com\/card_content\/\d+/)) {
                        text = candidate[22] && candidate[22][0] || text;
                    }

                    // Extract thoughts
                    let thoughts = null;
                    try {
                        thoughts = candidate[37][0][0];
                    } catch (e) {
                        // thoughts not available
                    }

                    // Extract web images
                    const webImages = [];
                    if (candidate[12] && candidate[12][1]) {
                        for (const webImage of candidate[12][1]) {
                            webImages.push(new WebImage(
                                webImage[0][0][0],
                                webImage[7][0],
                                webImage[0][4],
                                this.proxy
                            ));
                        }
                    }

                    // Extract generated images
                    const generatedImages = [];
                    if (candidate[12] && candidate[12][7] && candidate[12][7][0]) {
                        // Find image body in response
                        let imgBody = null;
                        for (let imgPartIndex = bodyIndex; imgPartIndex < responseJson.length; imgPartIndex++) {
                            try {
                                const imgPart = JSON.parse(responseJson[imgPartIndex][2]);
                                if (imgPart[4][candidateIndex][12][7][0]) {
                                    imgBody = imgPart;
                                    break;
                                }
                            } catch (e) {
                                continue;
                            }
                        }

                        if (!imgBody) {
                            throw new ImageGenerationError("Failed to parse generated images. Please update gemini_webapi to the latest version.");
                        }

                        const imgCandidate = imgBody[4][candidateIndex];
                        
                        // Clean up text by removing image generation URLs
                        text = text.replace(/http:\/\/googleusercontent\.com\/image_generation_content\/\d+/g, "").trim();

                        // Process generated images: download, handle redirects, include cookies, and upload to tmpfiles.org
                        for (let imageIndex = 0; imageIndex < imgCandidate[12][7][0].length; imageIndex++) {
                            const generatedImage = imgCandidate[12][7][0][imageIndex];
                            const originalImageUrl = generatedImage[0][3][3];
                            const imageUrl = originalImageUrl.replace("=s512", ""); // Remove =s512 to get full resolution

                            try {
                                // Download image with cookies and handle redirects
                                let fetchResponse = await axios.get(imageUrl, {
                                    responseType: "arraybuffer",
                                    maxRedirects: 0, // Disable automatic redirects
                                    validateStatus: status => status >= 200 && status < 400, // Accept 2xx and 3xx status codes
                                    headers: {
                                        "Cookie": cookieString // Include cookies
                                    },
                                    proxy: this.proxy
                                });

                                // Handle manual redirects
                                if (fetchResponse.status === 301 || fetchResponse.status === 302) {
                                    const redirectUrl = fetchResponse.headers.location;
                                    fetchResponse = await axios.get(redirectUrl, {
                                        responseType: "arraybuffer",
                                        headers: {
                                            "Cookie": cookieString // Include cookies for redirect
                                        },
                                        proxy: this.proxy
                                    });
                                }

                                const imageBuffer = Buffer.from(fetchResponse.data);
                                const uploadedUrl = await uploadAndFormatFile(
                                    imageBuffer,
                                    `generated_image_${Date.now()}_${imageIndex}.jpg`
                                );

                                generatedImages.push(new GeneratedImage(
                                    uploadedUrl, // tmpfiles.org URL
                                    `[Generated Image ${generatedImage[3][6]}]`,
                                    generatedImage[3][5].length > imageIndex 
                                        ? generatedImage[3][5][imageIndex] 
                                        : generatedImage[3][5][0],
                                    this.proxy,
                                    this.cookies,
                                    originalImageUrl // Store original Googleusercontent URL
                                ));
                            } catch (imgError) {
                                Logger.warning(`Failed to process generated image ${originalImageUrl}: ${imgError.message}`);
                                // Fallback to original URL if processing fails
                                generatedImages.push(new GeneratedImage(
                                    originalImageUrl,
                                    `[Generated Image ${generatedImage[3][6]}]`,
                                    generatedImage[3][5].length > imageIndex 
                                        ? generatedImage[3][5][imageIndex] 
                                        : generatedImage[3][5][0],
                                    this.proxy,
                                    this.cookies,
                                    originalImageUrl
                                ));
                            }
                        }
                    }

                    candidates.push(new Candidate(
                        candidate[0],
                        text,
                        thoughts,
                        webImages,
                        generatedImages
                    ));
                }

                if (candidates.length === 0) {
                    throw new GeminiError("Failed to generate contents. No output data found in response.");
                }

                const output = new ModelOutput(body[1], candidates);

                if (chat) {
                    chat.lastOutput = output;
                }

                return output;

            } catch (error) {
                if (error.code === "ECONNABORTED") {
                    throw new TimeoutError("Generate content request timed out, please try again. If the problem persists, consider setting a higher timeout value when initializing GeminiClient.");
                }
                throw error;
            }
        }, 2);
    }

    startChat(options = {}) {
        return new ChatSession(this, options);
    }
}

class ChatSession {
    constructor(geminiClient, options = {}) {
        const {
            metadata = [null, null, null],
            cid = null,
            rid = null,
            rcid = null,
            model = Model.UNSPECIFIED,
            gem = null
        } = options;

        this._metadata = [null, null, null];
        this.geminiClient = geminiClient;
        this.lastOutput = null;
        this.model = model;
        this.gem = gem;

        if (metadata) {
            this.metadata = metadata;
        }
        if (cid) {
            this.cid = cid;
        }
        if (rid) {
            this.rid = rid;
        }
        if (rcid) {
            this.rcid = rcid;
        }
    }

    toString() {
        return `ChatSession(cid=\'${this.cid}\', rid=\'${this.rid}\', rcid=\'${this.rcid}\')`;
    }

    set lastOutput(value) {
        this._lastOutput = value;
        if (value instanceof ModelOutput) {
            this.metadata = value.metadata;
            this.rcid = value.rcid;
        }
    }

    get lastOutput() {
        return this._lastOutput;
    }

    async sendMessage(prompt, files = null) {
        return await this.geminiClient.generateContent(
            prompt,
            files,
            this.model,
            this.gem,
            this
        );
    }

    chooseCandidate(index) {
        if (!this.lastOutput) {
            throw new Error("No previous output data found in this chat session.");
        }

        if (index >= this.lastOutput.candidates.length) {
            throw new Error(`Index ${index} exceeds the number of candidates in last model output.`);
        }

        this.lastOutput.chosen = index;
        this.rcid = this.lastOutput.rcid;
        return this.lastOutput;
    }

    get metadata() {
        return this._metadata;
    }

    set metadata(value) {
        if (value.length > 3) {
            throw new Error("metadata cannot exceed 3 elements");
        }
        for (let i = 0; i < value.length; i++) {
            this._metadata[i] = value[i];
        }
    }

    get cid() {
        return this._metadata[0];
    }

    set cid(value) {
        this._metadata[0] = value;
    }

    get rid() {
        return this._metadata[1];
    }

    set rid(value) {
        this._metadata[1] = value;
    }

    get rcid() {
        return this._metadata[2];
    }

    set rcid(value) {
        this._metadata[2] = value;
    }
}

module.exports = {
    GeminiClient,
    ChatSession
};



