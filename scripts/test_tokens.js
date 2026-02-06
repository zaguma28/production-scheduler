
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";

const COMBINATIONS = [
    { id: 506, token: "3CakeA8SORFDrOawAcL3Y2UY8TogZkLw52U5RBo", name: "New ID + New Token" },
    { id: 506, token: "xZ85wdaTlqTnSpOxvaLEJrR8E5pCaJaX0jDcdpd7", name: "New ID + Old Token" },
    { id: 351, token: "3CakeA8SORFDrOawAcL3Y2UY8TogZkLw52U5RBo", name: "Old ID + New Token" },
    { id: 351, token: "xZ85wdaTlqTnSpOxvaLEJrR8E5pCaJaX0jDcdpd7", name: "Old ID + Old Token" }
];

async function checkCredential(combo) {
    return new Promise((resolve) => {
        const options = {
            hostname: DOMAIN,
            path: `/k/v1/app/form/fields.json?app=${combo.id}`,
            method: 'GET',
            headers: {
                'X-Cybozu-API-Token': combo.token,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode === 200) {
                        console.log(`[SUCCESS] ${combo.name} (ID: ${combo.id}): Valid!`);
                        resolve(true);
                    } else {
                        console.log(`[FAILED]  ${combo.name} (ID: ${combo.id}): ${json.code} - ${json.message}`);
                        resolve(false);
                    }
                } catch (e) {
                    console.log(`[ERROR]   ${combo.name}: Parse error`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (e) => {
            console.log(`[ERROR]   ${combo.name}: Request error ${e.message}`);
            resolve(false);
        });
        req.end();
    });
}

async function main() {
    console.log("Testing credentials...");
    for (const combo of COMBINATIONS) {
        await checkCredential(combo);
    }
}

main();
