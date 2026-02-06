
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";
const APP_ID = 507;
const TOKEN = "hkVvZfY6j5dgNSda9OE8WPnLefezfrIoGsR387gL";

async function getFields() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: DOMAIN,
            path: `/k/v1/app/form/fields.json?app=${APP_ID}`,
            method: 'GET',
            headers: {
                'X-Cybozu-API-Token': TOKEN
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log("\n--- Field Codes (App 507) ---");
                    if (json.properties) {
                        console.log(Object.keys(json.properties).join(", "));
                    } else {
                        console.log("Error:", JSON.stringify(json, null, 2));
                    }
                    resolve();
                } catch (e) {
                    console.log("Parse Error");
                    resolve();
                }
            });
        });
        req.end();
    });
}

getFields();
