const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Image class for handling web and generated images
class Image {
    constructor(url, title, alt, proxy = null) {
        this.url = url;
        this.title = title;
        this.alt = alt;
        this.proxy = proxy;
    }

    toString() {
        return `${this.title}\n${this.url}\n${this.alt}`;
    }

    async save(savePath = "./", filename = null, skipInvalidFilename = false, verbose = false) {
        try {
            // Generate filename if not provided
            if (!filename) {
                const urlParts = this.url.split("/");
                filename = urlParts[urlParts.length - 1] || "image.jpg";
            }

            const fullPath = path.join(savePath, filename);
            
            // Create directory if it doesn"t exist
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const config = {
                method: "get",
                url: this.url,
                responseType: "stream"
            };

            if (this.proxy) {
                config.proxy = this.proxy;
            }

            const response = await axios(config);
            const writer = fs.createWriteStream(fullPath);
            
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on("finish", () => {
                    if (verbose) {
                        console.log(`Image saved to: ${fullPath}`);
                    }
                    resolve(fullPath);
                });
                writer.on("error", reject);
            });
        } catch (error) {
            if (skipInvalidFilename) {
                console.warn(`Skipping invalid filename: ${filename}`);
                return null;
            }
            throw error;
        }
    }
}

class WebImage extends Image {
    constructor(url, title, alt, proxy = null) {
        super(url, title, alt, proxy);
        this.type = "web";
    }
}

class GeneratedImage extends Image {
    constructor(url, title, alt, proxy = null, cookies = null, original_url = null) {
        super(url, title, alt, proxy);
        this.type = "generated";
        this.cookies = cookies;
        this.original_url = original_url || url; // Store the original URL from Gemini
    }

    async save(savePath = "./", filename = null, skipInvalidFilename = false, verbose = false) {
        try {
            // Generate filename if not provided
            if (!filename) {
                const urlParts = this.url.split("/");
                filename = urlParts[urlParts.length - 1] || "generated_image.jpg";
            }

            const fullPath = path.join(savePath, filename);
            
            // Create directory if it doesn"t exist
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const config = {
                method: "get",
                url: this.url,
                responseType: "stream"
            };

            if (this.proxy) {
                config.proxy = this.proxy;
            }

            if (this.cookies) {
                const cookieString = Object.entries(this.cookies)
                    .map(([key, value]) => `${key}=${value}`)
                    .join("; ");
                config.headers = { Cookie: cookieString };
            }

            const response = await axios(config);
            const writer = fs.createWriteStream(fullPath);
            
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on("finish", () => {
                    if (verbose) {
                        console.log(`Generated image saved to: ${fullPath}`);
                    }
                    resolve(fullPath);
                });
                writer.on("error", reject);
            });
        } catch (error) {
            if (skipInvalidFilename) {
                console.warn(`Skipping invalid filename: ${filename}`);
                return null;
            }
            throw error;
        }
    }
}

// Candidate class for handling response candidates
class Candidate {
    constructor(rcid, text, thoughts = null, webImages = [], generatedImages = []) {
        this.rcid = rcid;
        this.text = text;
        this.thoughts = thoughts;
        this.webImages = webImages;
        this.generatedImages = generatedImages;
    }

    get images() {
        return [...this.webImages, ...this.generatedImages];
    }

    toString() {
        return this.text;
    }
}

// ModelOutput class for handling API responses
class ModelOutput {
    constructor(metadata, candidates, chosen = 0) {
        this.metadata = metadata;
        this.candidates = candidates;
        this.chosen = chosen;
    }

    get text() {
        return this.candidates[this.chosen].text;
    }

    get thoughts() {
        return this.candidates[this.chosen].thoughts;
    }

    get webImages() {
        return this.candidates[this.chosen].webImages || [];
    }

    get generatedImages() {
        return this.candidates[this.chosen].generatedImages || [];
    }

    get images() {
        return this.candidates[this.chosen].images;
    }

    get rcid() {
        return this.candidates[this.chosen].rcid;
    }

    toString() {
        return this.text;
    }
}

// Gem class for handling system prompts
class Gem {
    constructor(id, name, description, prompt = null, predefined = false) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.prompt = prompt;
        this.predefined = predefined;
    }

    toString() {
        return `Gem(id="${this.id}", name="${this.name}", predefined=${this.predefined})`;
    }
}

// GemJar class for managing gems collection
class GemJar {
    constructor(gems = []) {
        this.gems = new Map();
        for (const [id, gem] of gems) {
            this.gems.set(id, gem);
        }
    }

    get(id = null, name = null) {
        if (id) {
            return this.gems.get(id);
        }
        if (name) {
            for (const gem of this.gems.values()) {
                if (gem.name === name) {
                    return gem;
                }
            }
        }
        return null;
    }

    filter(predefined = null) {
        const filtered = new Map();
        for (const [id, gem] of this.gems) {
            if (predefined === null || gem.predefined === predefined) {
                filtered.set(id, gem);
            }
        }
        return new GemJar([...filtered]);
    }

    toArray() {
        return Array.from(this.gems.values());
    }

    get size() {
        return this.gems.size;
    }
}

module.exports = {
    Image,
    WebImage,
    GeneratedImage,
    Candidate,
    ModelOutput,
    Gem,
    GemJar
};



