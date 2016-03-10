
var express = require('express'),
    request = require('supertest'),
    expect = require('chai').expect,
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

describe('HSUDB is middleware', function () {

    // generate our HSUDB middleware
    var hsudbProtect = hsudb();

    it('that provides a signUrl function', function (done) {

        var app = createApp();

        app.get('/', hsudbProtect, function (req, res, next) {
            return res.status(200).send(Object.keys(req).indexOf('signUrl') >= 0 && typeof req.signUrl === 'function');
        });

        createAgent(app)
        .get('/')
        .expect(200, 'true', done);

    });

});
