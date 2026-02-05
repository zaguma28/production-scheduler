
import https from 'https';

const DOMAIN = "jfe-rockfiber.cybozu.com";
const APP_ID = 506;
const TOKEN = "3CakeA8SORFDrOawAcL3Y2UY8TogZkLw52U5RBo";

async function getFields() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: DOMAIN,
            path: `/k/v1/app/form/fields.json?app=${APP_ID}`,
            method: 'GET',
            headers: {
                'X-Cybozu-API-Token': TOKEN,
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
                    resolve(json);
                } catch (e) {
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

getFields().then(data => {
    console.log(JSON.stringify(data, null, 2));
}).catch(err => {
    console.error(err);
});
