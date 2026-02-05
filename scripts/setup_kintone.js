
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";
const BASE_URL = `https://${DOMAIN}/k/v1`;

const APPS = [
    {
        id: 506,
        token: "3CakeA8SORFDrOawAcL3Y2UY8TogZkLw52U5RBo",
        fields: {
            "製造備考": {
                "type": "SINGLE_LINE_TEXT",
                "code": "製造備考",
                "label": "製造備考",
                "noLabel": false,
                "required": false,
                "unique": false
            }
        }
    },
    {
        id: 507,
        token: "hkVvZfY6j5dgNSda9OE8WPnLefezfrIoGsR387gL",
        fields: {
            "product_name": {
                "type": "SINGLE_LINE_TEXT",
                "code": "product_name",
                "label": "種別",
                "noLabel": false,
                "required": true,
                "unique": false
            },
            "notes": {
                "type": "SINGLE_LINE_TEXT",
                "code": "notes",
                "label": "内容",
                "noLabel": false,
                "required": false,
                "unique": false
            },
            "start_datetime": {
                "type": "DATETIME",
                "code": "start_datetime",
                "label": "開始日時",
                "noLabel": false,
                "required": true,
                "unique": false
            },
            "end_datetime": {
                "type": "DATETIME",
                "code": "end_datetime",
                "label": "終了日時",
                "noLabel": false,
                "required": true,
                "unique": false
            },
            "production_status": {
                "type": "SINGLE_LINE_TEXT",
                "code": "production_status",
                "label": "状態",
                "noLabel": false,
                "required": false,
                "unique": false
            }
        }
    }
];

async function kintoneRequest(method, endpoint, apiToken, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: DOMAIN,
            path: `/k/v1/${endpoint}`,
            method: method,
            headers: {
                'X-Cybozu-API-Token': apiToken,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject({ status: res.statusCode, error: json });
                    }
                } catch (e) {
                    reject({ status: res.statusCode, error: data });
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function setupApp(app) {
    console.log(`\n=== Setup App ID: ${app.id} ===`);
    try {
        // 1. Add fields
        console.log("Adding fields...");
        try {
            const result = await kintoneRequest('POST', 'preview/app/form/fields.json', app.token, {
                app: app.id,
                properties: app.fields
            });
            console.log("Fields added successfully:", result);
        } catch (e) {
            if (e.error && e.error.code === 'GAIA_IF01') {
                 console.log("Fields might already exist or partial failure. trying to continue...");
            } else {
                 console.error("Failed to add fields:", JSON.stringify(e, null, 2));
                 // Consider getting existing fields to see what's missing, but for now just warn
            }
        }

        // 2. Deploy
        console.log("Deploying app...");
        try {
             const result = await kintoneRequest('POST', 'preview/app/deploy.json', app.token, {
                apps: [{ app: app.id }]
            });
            console.log("Deploy requested successfully:", result);
        } catch (e) {
            console.error("Failed to deploy:", JSON.stringify(e, null, 2));
        }

    } catch (e) {
        console.error("Unexpected error:", e);
    }
}

async function main() {
    for (const app of APPS) {
        await setupApp(app);
    }
}

main();
