
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";
const CONFIGS = [
    { id: 506, token: "3CakeA8SORFDrOawAcL3Y2UEY8TogZkLw52U5RBo" },
    { id: 507, token: "hkVvZfY6j5dgNSda9OE8WPnLefezfrIoGsR387gL" }
];

async function checkTypes(config) {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: DOMAIN,
            path: `/k/v1/app/form/fields.json?app=${config.id}`,
            method: 'GET',
            headers: { 'X-Cybozu-API-Token': config.token }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`\n--- App ${config.id} ---`);
                    if (json.properties) {
                        const start = json.properties.start_datetime;
                        const end = json.properties.end_datetime;
                        console.log(`start_datetime: ${start ? start.type : 'NOT FOUND'}`);
                        console.log(`end_datetime:   ${end ? end.type : 'NOT FOUND'}`);
                    } else {
                        console.log("Error:", json.message);
                    }
                } catch (e) { console.log(e); }
                resolve();
            });
        });
        req.end();
    });
}

async function main() {
    for (const c of CONFIGS) await checkTypes(c);
}
main();
