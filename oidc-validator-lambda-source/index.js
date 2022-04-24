const jwt = require("jsonwebtoken");
const https = require("https");
const { STSClient, AssumeRoleCommand } = require("@aws-sdk/client-sts");

const claims = {
    sub: "repo:ethanrucinski/.*:refs/heads/main",
    job_workflow_ref: "ethanrucinski/.*/.github/workflows/.*.yaml@.*",
};

// Download latest JWKS from GitHub token issuer
const downloadJwks = () => {
    return new Promise((resolve, reject) => {
        const req = https.get(
            "https://token.actions.githubusercontent.com/.well-known/jwks",
            (res) => {
                let data = [];
                res.on("data", (d) => {
                    data.push(d);
                });
                res.on("close", () => {
                    resolve(Buffer.concat(data));
                });
                req.on("error", (error) => {
                    console.log("Error retrieving GitHub JWKS " + error);
                    reject(error);
                });
            }
        );
        req.on("error", (error) => {
            console.log("Error loading GitHub JWKS " + error);
            reject(error);
        });
        req.end();
    });
};

exports.handler = async function (event) {
    // Get token
    const token = event.token;

    // Grab JWKS
    let jwks;
    try {
        const jwksBuffer = await downloadJwks();
        jwks = JSON.parse(String(jwksBuffer));
    } catch (err) {
        console.log(err);
        throw "GITHUB_JWKS_ERROR";
    }

    // Get header
    const headerPart = Buffer.from(token.split(".")[0], "base64");
    const header = JSON.parse(headerPart.toString());

    // Use header to pick x5c
    const keys = jwks.keys.filter((key) => key.x5t == header.x5t);
    if (keys.length != 1) {
        console.log("Couldn't find a matching x5t for token");
        console.log(header.x5t);
        throw "INVALID_TOKEN";
    }

    // decode token with some validations
    let decoded;
    try {
        decoded = jwt.verify(
            token,
            "-----BEGIN CERTIFICATE-----\n" +
                keys[0].x5c[0] +
                "\n-----END CERTIFICATE-----",
            {
                issuer: "https://token.actions.githubusercontent.com",
                audience: "sts.amazonaws.com",
            }
        );
    } catch (err) {
        console.log("Couldn't decode token");
        console.log(err);
        throw "INVALID_TOKEN";
    }

    // Validate claims
    const claimResults = Object.keys(claims).map(
        (claimKey) => decoded[claimKey].match(claims[claimKey]).length == 1
    );
    if (claimResults.includes(false)) {
        console.log("Couldn't validate claims!");
        throw "INVALID_TOKEN";
    }

    // Assume role and send back token
    const client = new STSClient();
    const command = new AssumeRoleCommand({
        RoleArn: process.env.GITHUB_ACTIONS_ROLE_ARN,
        RoleSessionName: `GITHUB_${decoded.actor}`,
    });
    try {
        const result = await new Promise((resolve, reject) => {
            client
                .send(command)
                .then((response) => {
                    resolve({
                        Credentials: response.Credentials,
                        AsumedRoleUser: response.AssumedRoleUser,
                    });
                })
                .catch((err) => {
                    console.log(err);
                    reject("INVALID_ASSUME_ROLE");
                });
        });
        return result;
    } catch (err) {
        throw err;
    }
};
