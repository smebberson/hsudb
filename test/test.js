
var url = require('url'),
    querystring = require('querystring'),
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

    var tamperedErrorHandler = function (err, req, res, next) {
            if (err.code !== 'EBADHMACDIGEST') {
                return next(err);
            }
            res.status(403).end('URL has been tampered with');
        },
        timedOutErrorHandler = function (err, req, res, next) {
            if (err.code !== 'ETIMEOUTHMACDIGEST') {
                return next(err);
            }
            res.status(403).end('URL has timed out');
        };

    it('must be passed a secret', function () {

        var fn = function () {
            var middleware = hsudb(); // eslint-disable-line no-unused-vars
        };

        expect(fn).to.throw(Error, /secret/);

    });

    it('must be passed a store function', function () {

        var fn = function () {
            var middleware = hsudb({ // eslint-disable-line no-unused-vars
                secret: 'secret'
            });
        };

        expect(fn).to.throw(Error, /store/);

    });

    it('must be passed a retrieve function', function () {

        var fn = function () {
            var middleware = hsudb({ // eslint-disable-line no-unused-vars
                secret: 'secret',
                store: function () { }
            });
        };

        expect(fn).to.throw(Error, /retrieve/);

    });

    it('must be passed a complete function', function () {

        var fn = function () {
            var middleware = hsudb({ // eslint-disable-line no-unused-vars
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
                var hsudbProtect = hsudb({ // eslint-disable-line no-unused-vars
                    secret: 'secret',
                    store: function () { },
                    retrieve: function () { },
                    complete: function () { }
                })();
            };

            expect(fn).to.throw(Error, /id/);

        });

        it('returns three stages of middleware', function () {

            var id = rndm(),
                hsudbProtect = hsudb({ // eslint-disable-line no-unused-vars
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
                    store: function (req, id, salt, callback) {

                        expect(id).to.equal(idOne);
                        expect(id).to.not.equal(idTwo);

                    },
                    retrieve: function () { },
                    complete: function () { }
                }),
                hsudbProtectTwo = hsudb({
                    secret: 'secret',
                    store: function (req, id, salt, callback) {

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

        describe('returns three stages of middleware,', function () {

            describe('.setup', function () {

                describe('provides a signUrl function', function () {

                    it('that is available on a route which has the .setup middleware', function (done) {

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

                    it('will request to store a salt', function (done) {

                        var id = rndm(),
                            app = createApp(),
                            store,
                            hsudbProtect;

                        // define the store function
                        store = function (req, _id, salt, callback) {
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

                    describe('which returns a promise', function () {

                        it('that will resolve if everything works', function (done) {

                            var id = rndm(),
                                app = createApp(),
                                store,
                                hsudbProtect;

                            // define the store function
                            store = function (req, _id, salt, callback) {
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

                        it('that will reject if an error is returned to the store function callback', function (done) {

                            var id = rndm(),
                                app = createApp(),
                                store,
                                hsudbProtect;

                            // define the store function
                            store = function (req, _id, salt, callback) {
                                return callback(new Error('Failed to store the salt.'));
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

                                }, function (err) {

                                    return res.status(500).send(err.message);

                                });

                            });

                            createAgent(app)
                            .get('/')
                            .expect(500, /Failed to store the salt/, done);

                        });

                    });

                    describe('accepts callbacks', function () {

                        it('that will be executed without an error if everything works', function (done) {

                            var id = rndm(),
                                app = createApp(),
                                store,
                                hsudbProtect;

                            // define the store function
                            store = function (req, _id, salt, callback) {
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

                                req.signUrl(urlToSign, done);

                            });

                            createAgent(app)
                            .get('/')
                            .end();

                        });

                        it('that will be passed an error if an error is returned from the store function', function (done) {

                            var id = rndm(),
                                app = createApp(),
                                store,
                                hsudbProtect;

                            // define the store function
                            store = function (req, _id, salt, callback) {
                                return callback(new Error('Failed to store the salt.'));
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

                                req.signUrl(urlToSign, function (err) {

                                    expect(err).to.exist;
                                    expect(err.message).to.equal('Failed to store the salt.');

                                    return done();

                                });

                            });

                            createAgent(app)
                            .get('/')
                            .end();

                        });

                    });

                });

            });

            describe('.verify', function () {

                it('will timeout after the specified TTL', function (done) {

                    this.timeout(3000);

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
                    store = function (req, _id, salt, callback) {
                        db[_id] = salt;
                        return callback();
                    };

                    // define the retrieve function
                    retrieve = function (req, _id, callback) {
                        return callback(null, db[_id]);
                    };

                    // create an instance of hsudb
                    hsudbProtect = hsudb({
                        ttl: 1,
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

                    app.use(timedOutErrorHandler);

                    agent
                    .get('/sign-url')
                    .expect(200, function (err, res) {

                        if (err) {
                            return done(err);
                        }

                        setTimeout(function () {

                            agent
                            .get(url.parse(signedUrl, true).path)
                            .expect(403, /timed out/, done);

                        }, 2000);

                    });

                });

                it('will use a custom urlToVerify method if provided', function (done) {

                    var id = rndm(),
                        app = createApp(),
                        agent = createAgent(app),
                        urlToSign = '/verify?user=6dg3tct749fj&ion=1&espv=2',
                        db = {},
                        signedUrl,
                        store,
                        retrieve,
                        hsudbProtect,
                        urlToVerify,
                        called = false;

                    // define the store function
                    store = function (req, _id, salt, callback) {
                        db[_id] = salt;
                        return callback();
                    };

                    retrieve = function (req, _id, callback) {
                        return callback(null, db[_id]);
                    };

                    // A custom method to determine the URL to verify.
                    urlToVerify = function (req, _id) {
                        called = true;
                        return req.body.signedUrl;
                    };

                    // create an instance of hsudb
                    hsudbProtect = hsudb({
                        secret: 'secret',
                        store: store,
                        retrieve: retrieve,
                        complete: function () {},
                        urlToVerify: urlToVerify
                    })

                    app.use(require('body-parser').json());

                    app.get('/', hsudbProtect(id).setup, function (req, res, next) {

                        req.signUrl(urlToSign).then(function (_signedUrl) {
                            signedUrl = _signedUrl;
                            return res.status(200).end();
                        }, done);

                    });

                    app.post('/verify-proxy', hsudbProtect(id).verify, function (req, res, next) {
                        res.status(200).send('entered');
                        expect(called).to.be.true;
                        return done();
                    });

                    agent
                    .get('/')
                    .expect(200, function (err, res) {

                        if (err) {
                            return done(err);
                        }

                        agent
                        .post('/verify-proxy')
                        .send({ 'signedUrl': signedUrl })
                        .end();

                    });

                });

                describe('executes the retrieve hook', function () {

                    it('to retrieve a salt', function (done) {

                        var id = rndm(),
                            app = createApp(),
                            agent = createAgent(app),
                            urlToSign = '/verify?user=6dg3tct749fj&ion=1&espv=2',
                            signedUrl,
                            store,
                            retrieve,
                            hsudbProtect;

                        // define the store function
                        store = function (req, _id, salt, callback) {
                            return callback();
                        };

                        retrieve = function (req, _id, callback) {
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

                    it('and will accept an error and pass it on', function (done) {

                        var id = rndm(),
                            app = createApp(),
                            agent = createAgent(app),
                            urlToSign = '/verify?user=6dg3tct749fj&ion=1&espv=2',
                            signedUrl,
                            store,
                            retrieve,
                            hsudbProtect;

                        // define the store function
                        store = function (req, _id, salt, callback) {
                            return callback();
                        };

                        retrieve = function (req, _id, callback) {
                            return callback(new Error('Failed to retrieve the salt.'));
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

                        app.use(function (err, req, res, next) {

                            expect(err).to.exist
                            expect(err.message).to.equal('Failed to retrieve the salt.');

                            return done();

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

                });

            });

            describe('.complete', function () {

                describe('executes the complete', function () {

                    it('and will request to remove a salt', function (done) {

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
                        store = function (req, _id, salt, callback) {
                            db[_id] = salt;
                            return callback();
                        };

                        retrieve = function (req, _id, callback) {
                            return callback(null, db[_id]);
                        };

                        complete = function (req, _id, callback) {
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

                });

            });

            describe('that collectively will sign a URL and', function () {

                it('verify the url', function (done) {

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
                    store = function (req, _id, salt, callback) {
                        db[_id] = salt;
                        return callback();
                    };

                    // define the retrieve function
                    retrieve = function (req, _id, callback) {
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

                it('403 upon verification failure', function (done) {

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
                    store = function (req, _id, salt, callback) {
                        db[_id] = salt;
                        return callback();
                    };

                    // define the retrieve function
                    retrieve = function (req, _id, callback) {
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

                            // tamper with the url
                            var tamperedUrl = url.parse(_signedUrl, true);

                            tamperedUrl.query.user += 1;
                            tamperedUrl.search = querystring.stringify(tamperedUrl.query);

                            signedUrl = tamperedUrl.format();

                            return res.status(200).end();

                        }, done);

                    });

                    app.get('/entry', hsudbProtect(id).verify, function (req, res, next) {
                        res.status(200).send('entered');
                    });

                    app.use(tamperedErrorHandler);

                    agent
                    .get('/sign-url')
                    .expect(200, function (err, res) {

                        if (err) {
                            return done(err);
                        }

                        agent
                        .get(url.parse(signedUrl, true).path)
                        .expect(403, /tampered/, done);

                    });

                });

                it('will allow the process to repeat', function (done) {

                    var id = rndm(),
                        app = createApp(),
                        agent = createAgent(app),
                        db = {},
                        urlToSign = '/entry?user=6dg3tct749fj&ion=1&espv=2',
                        signedUrl,
                        store,
                        retrieve,
                        complete,
                        hsudbProtect;

                    // define the store function
                    store = function (req, _id, salt, callback) {
                        db[_id] = salt;
                        return callback();
                    };

                    // define the retrieve function
                    retrieve = function (req, _id, callback) {
                        return callback(null, db[_id]);
                    };

                    // define the complete function
                    complete = function (req, _id) {
                        delete db[_id];
                    };

                    // create an instance of hsudb
                    hsudbProtect = hsudb({
                        secret: 'secret',
                        store: store,
                        retrieve: retrieve,
                        complete: complete
                    })

                    app.get('/sign-url', hsudbProtect(id).setup, function (req, res, next) {

                        req.signUrl(urlToSign).then(function (_signedUrl) {

                            signedUrl = _signedUrl;

                            return res.status(200).send('signed');

                        }, done);

                    });

                    app.get('/entry', hsudbProtect(id).verify, hsudbProtect(id).complete, function (req, res, next) {

                        // complete the process
                        req.hsudbComplete();

                        // make sure the database is empty
                        expect(Object.keys(db)).to.be.empty;

                        // we're done
                        res.status(200).send('complete');

                    });

                    app.use(tamperedErrorHandler);

                    agent
                    .get('/sign-url')
                    .expect(200, 'signed', function (err, res) {

                        if (err) {
                            return done(err);
                        }

                        agent
                        .get(url.parse(signedUrl, true).path)
                        .expect(200, 'complete', function (completeErr, completeRes) {

                            if (completeErr) {
                                return done(completeErr);
                            }

                            // start the process again
                            agent
                            .get('/sign-url')
                            .expect(200, function (repeatErr, repeatRes) {

                                if (repeatErr) {
                                    return done(repeatErr);
                                }

                                agent
                                .get(url.parse(signedUrl, true).path)
                                .expect(200, 'complete', done)

                            });

                        });

                    });

                });

                it('will 403 if request repeated after completion', function (done) {

                    var id = rndm(),
                        app = createApp(),
                        agent = createAgent(app),
                        db = {},
                        urlToSign = '/entry?user=6dg3tct749fj&ion=1&espv=2',
                        signedUrl,
                        store,
                        retrieve,
                        complete,
                        hsudbProtect;

                    // define the store function
                    store = function (req, _id, salt, callback) {
                        db[_id] = salt;
                        return callback();
                    };

                    // define the retrieve function
                    retrieve = function (req, _id, callback) {
                        return callback(null, db[_id]);
                    };

                    // define the complete function
                    complete = function (req, _id) {
                        delete db[_id];
                    };

                    // create an instance of hsudb
                    hsudbProtect = hsudb({
                        secret: 'secret',
                        store: store,
                        retrieve: retrieve,
                        complete: complete
                    })

                    app.get('/sign-url', hsudbProtect(id).setup, function (req, res, next) {

                        req.signUrl(urlToSign).then(function (_signedUrl) {

                            signedUrl = _signedUrl;

                            return res.status(200).send('signed');

                        }, done);

                    });

                    app.get('/entry', hsudbProtect(id).verify, hsudbProtect(id).complete, function (req, res, next) {

                        // complete the process
                        req.hsudbComplete();

                        // make sure the database is empty
                        expect(Object.keys(db)).to.be.empty;

                        // we're done
                        res.status(200).send('complete');

                    });

                    app.use(tamperedErrorHandler);

                    agent
                    .get('/sign-url')
                    .expect(200, 'signed', function (err, res) {

                        if (err) {
                            return done(err);
                        }

                        agent
                        .get(url.parse(signedUrl, true).path)
                        .expect(200, 'complete', function (completeErr, completeRes) {

                            if (completeErr) {
                                return done(completeErr);
                            }

                            // repeat the request
                            agent
                            .get(url.parse(signedUrl, true).path)
                            .expect(403, done);

                        });

                    });

                });

            });

        });

    });

});
