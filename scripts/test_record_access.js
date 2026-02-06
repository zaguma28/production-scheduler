
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";
const APP_ID = 506;
const TOKEN = "3CakeA8SORFDrOawAcL3Y2UEY8TogZkLw52U5RBo";

async function getRecords() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: DOMAIN,
            path: `/k/v1/records.json?app=${APP_ID}&limit=1`,
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
                    if (res.statusCode === 200) {
                        console.log("SUCCESS! Retrieved records:", json.records.length);
                        if (json.records.length > 0) {
                             console.log("Sample Record ID:", json.records[0].$id.value);
                        }
                        resolve(true);
                    } else {
                        console.log(`FAILED: ${json.code} - ${json.message}`);
                        console.log(JSON.stringify(json, null, 2));
                        resolve(false);
                    }
                } catch (e) {
                    console.log("Parse Error");
                    resolve(false);
                }
            });
        });
        
        req.on('error', (e) => {
            console.log("Request Error:", e);
            resolve(false);
        });
        req.end();
    });
}

getRecords();
