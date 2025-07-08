const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { Endpoint, Headers } = require("./constants.js");
const { AuthError } = require("./exceptions.js");

// Utility functions for file handling and API operations

async function uploadFile(filePath, proxy = null) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        
        const formData = new FormData();
        formData.append("file", fileBuffer, fileName);
        
        const config = {
            method: "post",
            url: Endpoint.UPLOAD,
            headers: {
                ...Headers.UPLOAD,
                ...formData.getHeaders()
            },
            data: formData
        };

        if (proxy) {
            config.proxy = proxy;
        }

        const response = await axios(config);
        return response.data;
    } catch (error) {
        throw new Error(`Failed to upload file: ${error.message}`);
    }
}

// New function to handle external URLs as files for Gemini
async function processExternalUrl(url) {
    return url;
}

function parseFileName(filePath) {
    return path.basename(filePath);
}

async function rotate1PSIDTS(cookies, proxy = null) {
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const filename = `.cached_1psidts_${cookies["__Secure-1PSID"]}.txt`;
    const cachePath = path.join(tempDir, filename);

    // Check if cache file was modified in the last minute to avoid 429 Too Many Requests
    if (fs.existsSync(cachePath)) {
        const stats = fs.statSync(cachePath);
        const now = Date.now();
        const fileTime = stats.mtime.getTime();
        if (now - fileTime <= 60000) { // 60 seconds
            return fs.readFileSync(cachePath, "utf8");
        }
    }

    try {
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join("; ");

        const config = {
            method: "post",
            url: Endpoint.ROTATE_COOKIES,
            headers: {
                ...Headers.ROTATE_COOKIES,
                "Cookie": cookieString
            },
            data: "[000,\"-0000000000000000000\"]"
        };

        if (proxy) {
            config.proxy = proxy;
        }

        const response = await axios(config);
        
        if (response.status === 401) {
            throw new AuthError("Authentication failed during cookie rotation");
        }

        // Extract new __Secure-1PSIDTS from response cookies
        const setCookieHeader = response.headers["set-cookie"];
        if (setCookieHeader) {
            for (const cookie of setCookieHeader) {
                if (cookie.includes("__Secure-1PSIDTS=")) {
                    const match = cookie.match(/__Secure-1PSIDTS=([^;]+)/);
                    if (match) {
                        const new1PSIDTS = match[1];
                        fs.writeFileSync(cachePath, new1PSIDTS);
                        return new1PSIDTS;
                    }
                }
            }
        }

        return null;
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }
        throw new Error(`Failed to rotate cookies: ${error.message}`);
    }
}

async function getAccessToken(baseCookies, proxy = null, verbose = false) {
    try {
        // First, get extra cookies from Google
        const googleConfig = {
            method: "get",
            url: Endpoint.GOOGLE
        };

        if (proxy) {
            googleConfig.proxy = proxy;
        }

        const googleResponse = await axios(googleConfig);
        const extraCookies = {};
        
        // Parse cookies from response
        const setCookieHeader = googleResponse.headers["set-cookie"];
        if (setCookieHeader) {
            for (const cookie of setCookieHeader) {
                const [cookiePart] = cookie.split(";");
                const [name, value] = cookiePart.split("=");
                if (name && value) {
                    extraCookies[name.trim()] = value.trim();
                }
            }
        }

        // Combine cookies
        const allCookies = { ...extraCookies, ...baseCookies };

        // Try to get access token
        const cookieString = Object.entries(allCookies)
            .map(([key, value]) => `${key}=${value}`)
            .join("; ");

        const config = {
            method: "get",
            url: Endpoint.INIT,
            headers: {
                ...Headers.GEMINI,
                "Cookie": cookieString
            }
        };

        if (proxy) {
            config.proxy = proxy;
        }

        const response = await axios(config);
        
        // Extract SNlM0e token from response
        const match = response.data.match(/"SNlM0e":"(.*?)"/);
        if (match) {
            if (verbose) {
                console.log("Successfully obtained access token");
            }
            return [match[1], allCookies];
        }

        throw new AuthError("Failed to extract access token from response");
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }
        throw new AuthError(`Failed to get access token: ${error.message}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Logger {
    static debug(message) {
        console.log(`[DEBUG] ${message}`);
    }

    static info(message) {
        console.log(`[INFO] ${message}`);
    }

    static warning(message) {
        console.warn(`[WARNING] ${message}`);
    }

    static error(message) {
        console.error(`[ERROR] ${message}`);
    }

    static success(message) {
        console.log(`[SUCCESS] ${message}`);
    }
}

module.exports = {
    uploadFile,
    processExternalUrl,
    parseFileName,
    rotate1PSIDTS,
    getAccessToken,
    sleep,
    Logger
};



