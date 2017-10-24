# HSUDB

(HMAC signed URLs)

[![npm](https://img.shields.io/npm/v/hsudb.svg)](https://www.npmjs.com/package/hsudb)
[![Build Status](https://travis-ci.org/smebberson/hsudb.svg?branch=master)](https://travis-ci.org/smebberson/hsudb)
[![Coverage Status](https://coveralls.io/repos/github/smebberson/hsudb/badge.svg?branch=master)](https://coveralls.io/github/smebberson/hsudb?branch=master)

This project is very similar to [HSU](https://github.com/smebberson/hsu). The difference is, HSUDB has been designed to store HMAC digests in the database rather than a users session. Hooks provide you with the flexibility to implement your own storage mechanism.

HSUDB can be used to create secure and protected automatic log-in links (sent via email, for example), like Medium has just implemented.

There are three stages to HSUDB:

- The setup stage in which a signed URL is created (i.e. a secure login link).
- The verify stage in which a URL is protected unless the signed URL is verified (i.e. a secure login link will error if tampered with).
- The complete stage in which the URL has been consumed and is finalized such that it can't be used again (i.e. a secure login link should only work once).

HSUDB also aims to meet the following goals:

- The storage mechanism is custom and implemented by developers - HSUDB makes no assumptions on this.
- The process should be able to restart at anytime, at which point, all previous signed URLs become unusable.
- A signed URL should only be valid for a limited amount of time.

## Install

```
$ npm install hsudb
```

## API

```
var hsudb = require('hsudb');
```

### hsudb(options)

Creates a functon (i.e. `hsuProtect`) which is called with an `id` to scope the middleware (allows multiple signed URLs to be in affect for the one user concurrently).

```
var hsudbProtect = hsudb({
    secret: '2A]>B=!Dzi7b7',
    store: function (req, id, salt, callback) { // store the salt },
    retrieve: function (req, id, callback) { // retrieve and return the salt },
    complete: function (req, id) { // remove the salt }
});
```

#### Options

The `hsudb` function takes a required `options` object. The options object has both required keys, and optional keys.

##### Required keys

The `hsudb` `options` object must have the following required keys:

###### secret

A `string` which will be used in the HMAC digest generation.

###### store

A `function` which will be called with the arguments `req`, `id`, `salt`, `callback`. The `store` function should store the `salt` in the database against a particular users record. It should store with it the `id` so each process can be identified. The `callback` accepts an `error` argument and will return this to `next` (Express-style) if this is returned.

###### retrieve

A `function` which will be called with the arguments `req`, `id`, `callback`. The `retrieve` function should retrieve the `salt` stored against a particular users record, specific to the `id`. The `callback` accepts the arguments `error` and `salt`. If an error is returned, it is passed to `next` (Express-style).

###### complete

A `function` which will be called with the arguments `req`, `id`. The `complete` function should remove the `salt` from the database, specific to the `id`. There is no `callback`.

##### Optional keys

The `hsudb` `options` object can also contain any of the following optional keys:

###### ttl

The number of seconds the URL should be valid for. Defaults to 1 hour (i.e. 3600 seconds).

###### urlToVerify

A `function` which will be called with the arguments `req`, `id`. The `urlToVerify` function should return the url which should be verified. There is no `callback`.

The provides a means to pass the verification url through another means, other than requesting it directly. For example, a secured API which passed the verification url as a body parameter.

This defaults to:
```
function urlToVerify (req, id) {
    return req.originalUrl;
}
```

### hsudbProtect(id)

_**Please note:** `hsudbProtect` is not part of the actual API, it is just the name of the variable holding the function produced by calling hsudb(options)._

Generates three stages of middleware, all scoped to the `id`, one for each stage of the process (i.e. setup, verify and complete). `id` scoping allows you to have multiple signed URLs in affect for the one user concurrently. The `id` semantically should represent the process:

```
hsudbProtect('verify-primary-email').setup // Function;
hsudbProtect('verify-primary-email').verify // Function;
hsudbProtect('verify-primary-email').complete // Function;

hsudbProtect('signin-via-email').setup // Function;
hsudbProtect('signin-via-email').verify // Function;
hsudbProtect('signin-via-email').complete // Function;
```

#### hsudbProtect(id).setup

This middleware adds a `req.signUrl(urlToSign)` function to make a signed URL. You need to pass a URL (`urlToSign`) to this function and it will return the original URL with a signed component.

`req.signUrl` will accept a callback:

```
req.signUrl('https://domain.com/login?user=hdud64jhdkv6bj4j4', function (signedUrl) {
    // do something with the signedUrl
});
```

`req.signUrl` also returns a promise if you prefer:

```
req.signUrl('https://domain.com/login?user=hdud64jhdkv6bj4j4').then(
    function (signedUrl) {
        // do something with the signedUrl
    },
    function (err) {
        // do something with the error
    }
);
```

#### hsudbProtect(id).verify

This middleware will 403 on all requests that are not verifiable signed URLs. You can use Express error middleware and inspect the errors (err.code) for `EBADHMACDIGEST` to represent a tampered URL and `ETIMEOUTHMACDIGEST` to represent a timed out URL.

If subsequent middleware on your routes are executed, it means the signed URL was verified. If the URL wasn't verified, an error is returned causing Express to immediately execute error handling middleware.

#### hsudbProtect(id).complete

This middleware adds a `req.hsudbComplete` function that will mark a current signed URL as complete. This method is will execute the `complete` function as provided in the `options` object signaling a particular process is complete and the salt should be removed from the database.

Use the `req.hsudbComplete` function only after your process has completed. For example, in the case of a log in via email, only once the user has logged in should this function be executed. It will in turn execute the `complete` function you provided to the `options` object allowing you to safely remove the salt from the database.

### A simple Express example

The following is an example of using HSUDB to generate a signed URL that will allow the user to automatically log in (just like Medium have implemented).

```
/* FILE: ./lib/sign-up.js */

// This file is a library representing the `store`, `retrieve` and `complete` functions that will be passed to hsudbComplete. These functions will be called in the various stages as described above.

var mongoose = require('mongoose'),
    log = require('./log');

var store = function (req, id, salt, callback) {

    mongoose.model('user').findById(req.user._id).exec(function (err, user) {

        if (err) {
            return callback(err);
        }

        user.set(id, salt);

        user.save(function (saveErr, savedUser) {

            if (saveErr) {
                return callback(err);
            }

            // we're all done
            return callback();

        });

    });

};

var retrieve = function (req, id, callback) {

    // find the salt we stored in the database
    mongoose.model('user').findById(req.params.id, id).exec(function (err, user) {

        if (err) {
            return callback(err);
        }

        // we're done
        return callback(null, user[id]);

    });

};

var complete = function (req, id) {

    // delete the salt stored in the database
    mongoose.model('user').findById(req.user._id).exec(function (err, user) {

        if (err) {
            return log.error({ err: saveErr }, 'An error occurred while retrieving the user.');
        }

        user.set(id, null);

        user.save(function (saveErr, savedUser) {

            if (saveErr) {
                return log.error({ err: saveErr }, `An error occurred while removing the ${id} salt.`);
            }

        });

    });

};

// export the public methods
module.exports = {
    store: store,
    retrieve: retrieve,
    complete: complete
};

/* FILE: ./app.js */

// This file represents a very simple Express app.

var express = require('express'),
    hsudb = require('hsudb'),
    libSignUp = require('./lib/sign-up');

// setup route middleware
var hsudbProtect = hsudb({
     secret: '9*3>Ne>aKk4g)',
     store: libSignUp.store,
     retrieve: libSignUp.retrieve,
     complete: libSignUp.complete
});

// create the Express app
var app = express();

// setup a route that accepts the email address of an account
app.get('/account/sign-in', function (req, res, next) {

    res.render('account-sign-in');

});

// setup a route that will email the user a sign-in link
app.post('/account/sign-in', hsudbProtect('account-sign-in').setup, function (req, res, next) {

    var signedUrl = req.signUrl(`/account/${req.user.id}/sign-in`).then(function () {

        // email the user the sign-in url

    }, function (err) {

        return next(err);

    });

    res.render('account-sign-in-email-sent');

});

// setup a route to verify the signed URL
app.get('/acount/:id/sign-in', hsudbProtect('account-sign-in').verify, hsudbProtect('account-sign-in').complete, function (req, res, next) {

    // This will only be executed if the signed URL passed
    // otherwise a HTTP status of 403 will be returned and this
    // will never execute.

    // log the user in

    // remove the salt
    req.hsudbComplete();

    res.redirect('/app');

});

```

## Debugging

hsudb uses the [debug module](https://www.npmjs.com/package/debug) to make integrating hsudb easier. Simply add `DEBUG=hsudb` to your environment and you'll see debug messages in your console.

## Change log

[Review the change log for all changes.](CHANGELOG.md)

## Contributing

Contributors are welcomed. HSUDB comes complete with an isolated development environment. You can [read more about contributing to HSUDB here](CONTRIBUTING.md).

## License

[MIT](LICENSE.md)
