
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";
const APP_ID = 506;
const TOKEN = "3CakeA8SORFDrOawAcL3Y2UY8TogZkLw52U5RBo";

async function checkPermissions() {
    console.log(`Checking App ${APP_ID} with token ending in ...${TOKEN.slice(-4)}`);
    
    // 1. Check Records (usually works)
    try {
        await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: DOMAIN,
                path: `/k/v1/records.json?app=${APP_ID}&limit=1`,
                method: 'GET',
                headers: { 'X-Cybozu-API-Token': TOKEN }
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    if (res.statusCode === 200) resolve();
                    else reject(`Records access failed: ${res.statusCode} ${data}`);
                });
            });
            req.on('error', reject);
            req.end();
        });
        console.log("✅ Record Read Permission: OK");
    } catch (e) {
        console.error("❌ Record Read Permission: FAILED -", e);
    }

    // 2. Check Fields (requires App Management)
    try {
        await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: DOMAIN,
                path: `/k/v1/app/form/fields.json?app=${APP_ID}`,
                method: 'GET',
                headers: { 'X-Cybozu-API-Token': TOKEN }
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.log("✅ Field Read Permission: OK");
                        const json = JSON.parse(data);
                        console.log("\n--- Field Codes ---");
                        Object.values(json.properties).forEach(p => {
                             if (p.code.includes("備考") || p.label.includes("備考")) {
                                 console.log(`FOUND: [${p.code}] (${p.label}) type=${p.type}`);
                             }
                        });
                        resolve();
                    } else {
                        reject(`Field access failed: ${res.statusCode} ${data}`);
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    } catch (e) {
        console.error("❌ Field Read Permission: FAILED");
        console.error(e);
    }
}

checkPermissions();
