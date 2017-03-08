
var url = require('url'),
    querystring = require('querystring'),
    crypto = require('crypto'),
    Promise = require('bluebird'),
    rndm = require('rndm'),
    scmp = require('scmp'),
    createError = require('http-errors');

/**
* Return a timestamp, optionally passing in extra seconds to add to the timestamp.
*
 * @param  {Number} ttl The extra seconds to add to the timestamp
 * @return {Number}     A timestamp in seconds
 */
function now (ttl) {

    if (ttl === undefined || ttl === null) {
        ttl = 0;
    }

    return Math.floor(new Date()/1000) + ttl;

}

/**
 * Create a HMAC digest based on a salt, a secret and a string.
 *
 * @param  {String} salt   The salt
 * @param  {String} secret The secret key
 * @param  {String} str    The string to included in the digest
 * @return {String}        A HMAC digest
 */
function createDigest (salt, secret, str) {

    // create the HMAC digest, using the URL path only
    return crypto
        .createHmac('sha256', secret)
        .update(`${salt}.${secret}.${str}`)
        .digest('base64');

}

/**
 * Given a modified (url.query has been manipulated) URL object (from url.parse())
 * return a string that matches what `url.path` would, but with correct values.
 *
 * @param  {Object} url An object as returned from `url.parse()` with a modified `query` property.
 * @return {String}     A string of the path (i.e. url.path + url.pathname)
 */
function urlPath (url) {

    // update the search, based on the query property
    url.search = querystring.stringify(url.query);

    // take into consideration empty search property when returning the string
    return url.pathname + (url.search ? `?${url.search}` : '');

}

/**
 * Given a modified (url.query has been manipulated) URL object (from url.parse())
 * return a string that mtaches what `url.path` would, but with correct values.
 *
 * @param  {Object} url An object as returned from `url.parse()` with a modified `query` property.
 * @return {String}     A string of the entire URL (including protocol, domain, pathname, path and search).
 */
function urlFormat (url) {

    url.search = querystring.stringify(url.query);

    return url.format();

}

/**
 * Given request, it returns the URL that should be verified.
 * @param  {Object} req The request object.
 * @return {String}     The URL to verify against.
 */
function urlToVerify (req, id) {

    return req.originalUrl;

}

/**
 * Verifies the URL being actioned by Express.
 *
 * @param  {String} path    The path of the URL
 * @param  {String} salt    The salt
 * @param  {String} secret  The secret key
 * @return {String|Boolean} true for valid, 'invalid' for 'invalid', 'timedout' if the request is too late
 */
function verifyUrl (path, salt, secret) {

    // recreate a digest from the URL path, minus the signature
    var parsedUrl = url.parse(path, true),
        parsedSignature = parsedUrl.query.signature,
        digest;

    // remove the signature as that isn't part of the signed string
    delete parsedUrl.query.signature;

    // recreate the digest
    digest = createDigest(salt, secret, urlPath(parsedUrl));

    // if we don't have the same value, we're unverified
    if (!scmp(digest, parsedSignature)) {
        return 'invalid';
    }

    parsedUrl.query.expires = parseInt(parsedUrl.query.expires) || 0;

    // verify if we're still within the expires timestamp
    return (now() < parsedUrl.query.expires) ? true : 'timedout';

}

/**
 * HMAC signed URLs middleware.
 *
 * This middleware adds a `req.signUrl()` function to sign a URL. This signed URL is validated
 * against the users database record.
 *
 * @param  {Object} options Configuration object.
 * @return {function}       Express middleware.
 */

module.exports = function hsudb (options) {

    options = options || {};

    if (!options.secret) {
        throw Error('You must provide a secret for HSUDB to sign with.');
    }

    if (!options.store) {
        throw Error('You must provide a store function for HSUDB to request a salt be stored.');
    }

    if (!options.retrieve) {
        throw Error('You must provide a retrieve function for HSUDB to request a salt be retrieved.');
    }

    if (!options.complete) {
        throw Error('You must provide a complete function for HSUDB to request a salt be removed.');
    }


    // get ttl options (default to 1 hour)
    var ttl = parseInt(options.ttl) || 60*60;

    // default the urlToVerify option
    var urlToVerifyFn = options.urlToVerify || urlToVerify;

    // return a function that will scope everything to an id (so we can use this middleware multiple times)
    return function (id) {

        if (!id) {
            throw Error('You must provide an id for HSUDB to scope with.');
        }

        return {

            setup: function hsudbSetupMiddleware (req, res, next) {

                // lazy-load our signUrl function
                req.signUrl = function signUrl (urlToSign, callback) {

                    // return a promise, but use the callback if one was provided
                    return new Promise(function (resolve, reject) {

                        // create the salt and hand off to the hook to store it
                        var salt = rndm();

                        options.store(req, id, salt, function (err) {

                            if (err) {
                                return reject(err);
                            }

                            // with the salt stored, let's continue
                            var parsedUrl = url.parse(urlToSign, true),
                                expires = now(ttl),
                                digest;

                            // update the parsedUrl with the expries value before it is signed
                            // this protects us from tampering with the value
                            parsedUrl.query.expires = expires;

                            // create the digest
                            digest = createDigest(salt, options.secret, urlPath(parsedUrl));

                            // now update the url with the information
                            parsedUrl.query.signature = digest;

                            // return the updated and signed URL
                            return resolve(urlFormat(parsedUrl));

                        });

                    }).asCallback(callback);

                }

                return next();

            },

            verify: function hsudbVerifyMiddleware (req, res, next) {

                // retrieve the salt from the hook
                options.retrieve(req, id, function (err, salt) {

                    if (err) {
                        return next(err);
                    }

                    // a salt should always exist, try and verify the request
                    var verified = verifyUrl(urlToVerifyFn(req, id), salt, options.secret);

                    if (verified === 'invalid') {
                        return next(createError(403, 'invalid HMAC digest', {
                            code: 'EBADHMACDIGEST'
                        }));
                    }

                    if (verified === 'timedout') {
                        return next(createError(403, 'URL has timed out', {
                            code: 'ETIMEOUTHMACDIGEST'
                        }));
                    }

                    return next();

                });

            },

            complete: function hsudbCompleteMiddleware (req, res, next) {

                req.hsudbComplete = function () {
                    options.complete(req, id);
                }

                return next();

            }

        }

    }

}
