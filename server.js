import puppeteer from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { axiosInstance } from "./axios.js";
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const port = 3000;
app.get('/', (req, res) => {
    res.json('Welcome');
});
const stealth = stealthPlugin();
puppeteer.use(stealth);
app.get('/api/extract', async (req, res) => {
    try {
        const id = req.query.id;

        if (!id) {
            return res.status(400).json({ error: 'Missing id parameter' });
        }
        const url = `https://aniwatchtv.to/ajax/v2/episode/sources?id=${id}`;
        const axiosResponse = await axiosInstance.get(url);
        const browser = await puppeteer.launch({
            executablePath: 
            process.env.NODE_ENV === "production"
              ? process.env.PUPPETEERR_EXECUTABLE_PATH
              : puppeteer.executablePath(),      
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-dev-shm-usage',
                '--disable-background-networking',
                '--disable-extensions',
            ],
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Referer': `${axiosResponse.data.link}`,
        });
        let m3u8LinkFound = false;
        const client = await page.target().createCDPSession();
        await client.send("Network.enable");
        await client.send("Network.setRequestInterception", {
            patterns: [
                {
                    urlPattern: "*",
                },
            ],
        });
        client.on(
            "Network.requestIntercepted",
            async ({ interceptionId, request, responseHeaders, resourceType }) => {
                if (request.url.includes("m3u8")) {
                    res.json({ url: request.url });
                    await browser.close();
                    m3u8LinkFound = true;
                } else {
                    client.send("Network.continueInterceptedRequest", {
                        interceptionId,
                    });
                }
            }
        );
        await page.goto(axiosResponse.data.link, { waitUntil: 'domcontentloaded' });
        if (!m3u8LinkFound) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        if (!m3u8LinkFound) {
            await browser.close();
            if (!res.headersSent) {
                res.json({ message: 'Extraction completed, M3U8 link not found' });
            }
        }
    } catch (error) {
        console.error("An error occurred:", error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});
app.listen(port, () => {
    console.log(`Server is listening at port:${port}`);
});
