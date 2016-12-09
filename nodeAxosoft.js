"use strict";
const AxosoftApi = require('node-axosoft');

class Axosoft {
    constructor(accountUrl, accessToken) {
        const axosoftApi = this.axosoftApi = new AxosoftApi(accountUrl, {
           access_token: accessToken
        });
    }

    promisify(apiFunction, args) {
        args = args || [];
        return new Promise((resolve, reject) => {
            args.push((error, response) => {
                if (error) reject(error);
                else resolve(response);
            });
            apiFunction.apply(null, args);
        });
    }
}

module.exports = Axosoft;