
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";
const APP_ID = 506;
const TOKEN = "3CakeA8SORFDrOawAcL3Y2UEY8TogZkLw52U5RBo";

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
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    console.error("Parse Error:", e);
                    console.log("Raw Data:", data);
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

console.log(`Checking fields for App ${APP_ID}...`);
getFields().then(data => {
    if (data.properties) {
        console.log("\n--- Field List ---");
        const entries = Object.entries(data.properties);
        const manufacturingNotes = entries.filter(([code, field]) => 
            code.includes("製造") || field.label.includes("製造") || field.code.includes("notes")
        );

        if (manufacturingNotes.length > 0) {
             console.log("Found related fields:");
             manufacturingNotes.forEach(([code, field]) => {
                 console.log(`- Code: [${field.code}], Label: [${field.label}], Type: ${field.type}`);
             });
        } else {
            console.log("No fields found containing '製造' or 'notes'.");
        }
        
        console.log("\n--- All Field Codes ---");
        console.log(Object.keys(data.properties).join(", "));
    } else {
        console.error("Error response:", JSON.stringify(data, null, 2));
    }
}).catch(err => {
    console.error("Request failed:", err);
});
