/*jshint esversion: 6 */
/* globals Buffer*/
const Quota = module.exports;

const Util = require("../common-util");
const Package = require('../../package.json');
const Https = require("https");

Quota.applyCustomLimits = function (Env) {
    var isLimit = function (o) {
        var valid = o && typeof(o) === 'object' &&
            typeof(o.limit) === 'number' &&
            typeof(o.plan) === 'string' &&
            typeof(o.note) === 'string';
        return valid;
    };

    // read custom limits from the Environment (taken from config)
    var customLimits = (function (custom) {
        var limits = {};
        Object.keys(custom).forEach(function (k) {
            k.replace(/\/([^\/]+)$/, function (all, safeKey) {
                var id = Util.unescapeKeyCharacters(safeKey || '');
                limits[id] = custom[k];
                return '';
            });
        });
        return limits;
    }(Env.customLimits || {}));

    Object.keys(customLimits).forEach(function (k) {
        if (!isLimit(customLimits[k])) { return; }
        Env.limits[k] = customLimits[k];
    });
};

Quota.updateCachedLimits = function (Env, cb) {
    if (Env.adminEmail === false) {
        Quota.applyCustomLimits(Env);
        if (Env.allowSubscriptions === false) { return; }
        throw new Error("allowSubscriptions must be false if adminEmail is false");
    }

    var body = JSON.stringify({
        domain: Env.myDomain,
        subdomain: Env.mySubdomain || null,
        adminEmail: Env.adminEmail,
        version: Package.version
    });
    var options = {
        host: 'accounts.cryptpad.fr',
        path: '/api/getauthorized',
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
        }
    };

    var req = Https.request(options, function (response) {
        if (!('' + response.statusCode).match(/^2\d\d$/)) {
            return void cb('SERVER ERROR ' + response.statusCode);
        }
        var str = '';

        response.on('data', function (chunk) {
            str += chunk;
        });

        response.on('end', function () {
            try {
                var json = JSON.parse(str);
                Env.limits = json;
                Quota.applyCustomLimits(Env);
                cb(void 0);
            } catch (e) {
                cb(e);
            }
        });
    });

    req.on('error', function (e) {
        Quota.applyCustomLimits(Env);
        // FIXME this is always falsey. Maybe we just suppress errors?
        if (!Env.domain) { return cb(); }
        cb(e);
    });

    req.end(body);
};

// The limits object contains storage limits for all the publicKey that have paid
// To each key is associated an object containing the 'limit' value and a 'note' explaining that limit
Quota.getUpdatedLimit = function (Env, safeKey, cb) { // FIXME BATCH?S
    Quota.updateCachedLimits(Env, function (err) {
        if (err) { return void cb(err); }

        var limit = Env.limits[safeKey];

        if (limit && typeof(limit.limit) === 'number') {
            return void cb(void 0, [limit.limit, limit.plan, limit.note]);
        }

        return void cb(void 0, [Env.defaultStorageLimit, '', '']);
    });
};

