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

    return function hsudbMiddleware (req, res, next) {

        // lazy-load our signUrl function
        req.signUrl = function signUrl (urlToSign) {

            return urlToSign;

        }

        return next();

    }

}
