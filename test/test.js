
var url = require('url'),
    express = require('express'),
    request = require('supertest'),
    expect = require('chai').expect,
    rndm = require('rndm'),
    hsudb = require('../');

/**
 * Helper function to create an instance of an Express app.
 * @return {Object} The Express app.
 */
function createApp () {

    // create the express app
    var app = express();

    return app;

}



/**
 * Helper function to create a supertest agent for testing HSUDB against.
 * @return {TestAgent} A supertest agent configured against the Express app.
 */
function createAgent (app) {

    return request.agent(app);

}

describe('HSUDB', function () {

    it('must be passed a secret', function () {

        var fn = function () {
            var middleware = hsudb();
        };

        expect(fn).to.throw(Error, /secret/);

    });

    it('must be passed a store function', function () {

        var fn = function () {
            var middleware = hsudb({
                secret: 'secret'
            });
        };

        expect(fn).to.throw(Error, /store/);

    });

    it('must be passed a retrieve function', function () {

        var fn = function () {
            var middleware = hsudb({
                secret: 'secret',
                store: function () { }
            });
        };

        expect(fn).to.throw(Error, /retrieve/);

    });

    it('must be passed a complete function', function () {

        var fn = function () {
            var middleware = hsudb({
                secret: 'secret',
                store: function () { },
                retrieve: function () { }
            });
        };

        expect(fn).to.throw(Error, /complete/);

    });

    describe('returns a scoping function that', function () {

        it('must be passed an id', function () {

            var fn = function () {
                var hsudbProtect = hsudb({
                    secret: 'secret',
                    store: function () { },
                    retrieve: function () { },
                    complete: function () { }
                })();
            };

            expect(fn).to.throw(Error, /id/);

        });

        it('returns three states of middleware', function () {

            var id = rndm(),
                hsudbProtect = hsudb({
                    secret: 'secret',
                    store: function () { },
                    retrieve: function () { },
                    complete: function () { }
                });

            expect(hsudbProtect(id)).to.have.property('setup');
            expect(hsudbProtect(id)).to.have.property('verify');
            expect(hsudbProtect(id)).to.have.property('complete');

        });

        it('allows multiple instances of HSUDB to run concurrently', function (done) {

            var idOne = rndm(),
                idTwo = rndm(),
                urlToSignOne = '/one?user=6dg3tct749fj&ion=1&espv=2',
                urlToSignTwo = '/two?user=6dg3tct749fj&ion=1&espv=2',
                hsudbProtectOne = hsudb({
                    secret: 'secret',
                    store: function (id, salt, callback) {

                        expect(id).to.equal(idOne);
                        expect(id).to.not.equal(idTwo);

                    },
                    retrieve: function () { },
                    complete: function () { }
                }),
                hsudbProtectTwo = hsudb({
                    secret: 'secret',
                    store: function (id, salt, callback) {

                        expect(id).to.equal(idTwo);
                        expect(id).to.not.equal(idOne);

                    },
                    retrieve: function () { },
                    complete: function () { }
                });

                var app = createApp();

                app.get('/pre/one', hsudbProtectOne(idOne).setup, function (req, res, next) {
                    req.signUrl(urlToSignOne);
                    res.status(200).end();
                });

                app.get('/pre/two', hsudbProtectTwo(idTwo).setup, function (req, res, next) {
                    req.signUrl(urlToSignTwo);
                    res.status(200).end();
                });

                var agent = createAgent(app);

                agent
                .get('/pre/one')
                .expect(200, function (errOne, res) {

                    if (errOne) {
                        return done(errOne);
                    }

                    agent
                    .get('/pre/two')
                    .expect(200, done);

                });

        });

        describe('returns middleware that', function () {

            it('provides a signUrl function', function (done) {

                var id = rndm(),
                    app = createApp(),
                    hsudbProtect = hsudb({
                        secret: 'secret',
                        store: function () { },
                        retrieve: function () { },
                        complete: function () { }
                    });

                app.get('/', hsudbProtect(id).setup, function (req, res, next) {
                    return res.status(200).send(Object.keys(req).indexOf('signUrl') >= 0 && typeof req.signUrl === 'function');
                });

                createAgent(app)
                .get('/')
                .expect(200, 'true', done);

            });

            describe('the signUrl function', function () {

                it('returns a promise', function (done) {

                    var id = rndm(),
                        app = createApp(),
                        store,
                        hsudbProtect;

                    // define the store function
                    store = function (_id, salt, callback) {
                        return callback();
                    };

                    // create an instance of hsudb
                    hsudbProtect = hsudb({
                        secret: 'secret',
                        store: store,
                        retrieve: function () { },
                        complete: function () { }
                    })

                    app.get('/', hsudbProtect(id).setup, function (req, res, next) {

                        var urlToSign = '/entry?user=6dg3tct749fj&ion=1&espv=2';

                        req.signUrl(urlToSign).then(function (signedUrl) {

                            expect(signedUrl).to.contain(urlToSign);

                            return res.status(200).end();

                        }, done);

                    });

                    createAgent(app)
                    .get('/')
                    .expect(200, done);

                });

                it('works with callbacks', function (done) {

                    var id = rndm(),
                        app = createApp(),
                        store,
                        hsudbProtect;

                    // define the store function
                    store = function (_id, salt, callback) {
                        return callback();
                    };

                    // create an instance of hsudb
                    hsudbProtect = hsudb({
                        secret: 'secret',
                        store: store,
                        retrieve: function () { },
                        complete: function () { }
                    })

                    app.get('/', hsudbProtect(id).setup, function (req, res, next) {

                        var urlToSign = '/entry?user=6dg3tct749fj&ion=1&espv=2';

                        req.signUrl(urlToSign, function (err, signedUrl) {

                            expect(err).to.not.exist;
                            expect(signedUrl).to.contain(urlToSign);

                            return res.status(200).end();

                        });

                    });

                    createAgent(app)
                    .get('/')
                    .expect(200, done);

                });

            });

            it('will request to store a salt', function (done) {

                var id = rndm(),
                    app = createApp(),
                    store,
                    hsudbProtect;

                // define the store function
                store = function (_id, salt, callback) {
                    return done();
                };

                // create an instance of hsudb
                hsudbProtect = hsudb({
                    secret: 'secret',
                    store: store,
                    retrieve: function () { },
                    complete: function () { }
                })

                app.get('/', hsudbProtect(id).setup, function (req, res, next) {

                    var urlToSign = '/entry?user=6dg3tct749fj&ion=1&espv=2';

                    req.signUrl(urlToSign);

                });

                createAgent(app)
                .get('/')
                .end();

            });

            it('will request to retrieve a salt', function (done) {

                var id = rndm(),
                    app = createApp(),
                    agent = createAgent(app),
                    urlToSign = '/verify?user=6dg3tct749fj&ion=1&espv=2',
                    signedUrl,
                    store,
                    retrieve,
                    hsudbProtect;

                // define the store function
                store = function (_id, salt, callback) {
                    return callback();
                };

                retrieve = function (_id, callback) {
                    return done()
                };

                // create an instance of hsudb
                hsudbProtect = hsudb({
                    secret: 'secret',
                    store: store,
                    retrieve: retrieve,
                    complete: function () { }
                })

                app.get('/', hsudbProtect(id).setup, function (req, res, next) {

                    req.signUrl(urlToSign).then(function (_signedUrl) {
                        signedUrl = _signedUrl;
                        return res.status(200).end();
                    }, done);

                });

                app.get('/verify', hsudbProtect(id).verify, function (req, res, next) {
                    res.status(200).send('entered');
                });

                agent
                .get('/')
                .expect(200, function (err, res) {

                    if (err) {
                        return done(err);
                    }

                    agent
                    .get(url.parse(signedUrl, true).path)
                    .end();

                });

            });

            it('will request to remove a salt', function (done) {

                var id = rndm(),
                    app = createApp(),
                    agent = createAgent(app),
                    urlToSign = '/verify?user=6dg3tct749fj&ion=1&espv=2',
                    db = {},
                    signedUrl,
                    store,
                    retrieve,
                    complete,
                    hsudbProtect;

                // define the store function
                store = function (_id, salt, callback) {
                    db[_id] = salt;
                    return callback();
                };

                retrieve = function (_id, callback) {
                    return callback(null, db[_id]);
                };

                complete = function (_id, callback) {
                    return done();
                };

                // create an instance of hsudb
                hsudbProtect = hsudb({
                    secret: 'secret',
                    store: store,
                    retrieve: retrieve,
                    complete: complete
                })

                app.get('/', hsudbProtect(id).setup, function (req, res, next) {

                    req.signUrl(urlToSign).then(function (_signedUrl) {
                        signedUrl = _signedUrl;
                        return res.status(200).end();
                    }, done);

                });

                app.get('/verify', hsudbProtect(id).verify, function (req, res, next) {
                    res.status(200).send('entered');
                });

                app.get('/complete', hsudbProtect(id).complete, function (req, res, next) {
                    req.hsudbComplete();
                    res.status('200').send('complete');
                });

                agent
                .get('/')
                .expect(200, function (err, res) {

                    if (err) {
                        return done(err);
                    }

                    agent
                    .get(url.parse(signedUrl, true).path)
                    .expect(200, 'entered', function (signedErr, signedRes) {

                        if (signedErr) {
                            return done(signedErr);
                        }

                        agent
                        .get('/complete')
                        .end();

                    });

                });

            });

            describe('will sign a URL', function () {

                it('and verify the url', function (done) {

                    var id = rndm(),
                        app = createApp(),
                        agent = createAgent(app),
                        db = {},
                        urlToSign = '/entry?user=6dg3tct749fj&ion=1&espv=2',
                        signedUrl,
                        store,
                        retrieve,
                        hsudbProtect;

                    // define the store function
                    store = function (_id, salt, callback) {
                        db[_id] = salt;
                        return callback();
                    };

                    // define the retrieve function
                    retrieve = function (_id, callback) {
                        return callback(null, db[_id]);
                    };

                    // create an instance of hsudb
                    hsudbProtect = hsudb({
                        secret: 'secret',
                        store: store,
                        retrieve: retrieve,
                        complete: function () { }
                    })

                    app.get('/sign-url', hsudbProtect(id).setup, function (req, res, next) {

                        req.signUrl(urlToSign).then(function (_signedUrl) {
                            signedUrl = _signedUrl;
                            return res.status(200).end();
                        }, done);

                    });

                    app.get('/entry', hsudbProtect(id).verify, function (req, res, next) {
                        res.status(200).send('entered');
                    });

                    agent
                    .get('/sign-url')
                    .expect(200, function (err, res) {

                        if (err) {
                            return done(err);
                        }

                        agent
                        .get(url.parse(signedUrl, true).path)
                        .expect(200, 'entered', done);

                    });

                });

            });

        });

    });

});
