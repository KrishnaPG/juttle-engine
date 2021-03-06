'use strict';
var path = require('path');
var fs = require('fs');
var expect = require('chai').expect;
var child_process = require('child_process');
var Promise = require('bluebird');
var findFreePort = Promise.promisify(require('find-free-port'));
var engine = require('../lib/juttle-engine');
var tmp = require('tmp');
var requestAsync = Promise.promisify(require('request'));

let juttle_engine_cmd = path.resolve(`${__dirname}/../bin/juttle-engine`);
let juttle_engine_client_cmd = path.resolve(`${__dirname}/../bin/juttle-engine-client`);

describe('juttle-engine-client binary', function() {

    let server;

    before(function() {
        findFreePort(10000, 20000)
        .then((freePort) => {
            server = 'localhost:' + freePort;
            engine.run({port: freePort, root: __dirname});
        });
    });

    after(function() {
        return engine.stop();
    });

    it('can be run with --help', function() {
        var ret = child_process.spawnSync(juttle_engine_client_cmd, ['--help']);
        // The status is 1, but we can also check the output for 'usage:'
        expect(ret.status).to.equal(1);
        expect(ret.stdout.toString()).to.match(/^usage: /);
    });

    it('can be run with list_jobs', function(done) {

        let got_output = false;

        // Can't use spawnSync here, as the server is running within
        // our own process, and spawnSync blocks the event loop.
        let child = child_process.spawn(juttle_engine_client_cmd, ['--juttle-engine', server, 'list_jobs']);

        child.stdout.on('data', (data) => {
            if (data.toString().match(/\[\]/)) {
                got_output = true;
            }
        });

        child.on('close', (code) => {
            expect(code).to.equal(0);
            expect(got_output).to.equal(true);
            done();
        });
    });

});


describe('juttle-engine binary', function() {

    it('can be run with --help', function() {
        var ret = child_process.spawnSync(juttle_engine_cmd, ['--help']);
        // The status is 1, but we can also check the output for 'usage:'
        expect(ret.status).to.equal(1);
        expect(ret.stdout.toString()).to.match(/^usage: /);
    });

    it('can be run and can see startup line', function(done) {
        var got_output = false;
        findFreePort(10000, 20000)
        .then((freePort) => {
            let child = child_process.spawn(juttle_engine_cmd, ['--port', freePort]);
            child.stdout.on('data', (data) => {
                if (data.toString().match(/Juttle engine listening at/)) {
                    got_output = true;
                    child.kill('SIGKILL');
                }
            });
            child.on('close', (code) => {
                expect(got_output).to.equal(true);
                done();
            });
            child.on('error', (msg) => {
                throw new Error(`Got error from child: ${msg}`);
            });
        });
    });

    it('serves a customizable index path', function(done) {
        let child, freePort;
        let tmpFile = tmp.fileSync({keep: true}).name;
        let html = '<html><body><h1>Juttle Engine Test</h1></body></html>';
        fs.writeFileSync(tmpFile, html);

        return findFreePort(10000, 20000)
        .then((port) => {
            freePort = port;
            child = child_process.spawn(juttle_engine_cmd, ['--port', freePort, '--index-path', tmpFile]);
            return new Promise((resolve, reject) => {
                child.stdout.on('data', (data) => {
                    if (data.toString().match(/Juttle engine listening at/)) {
                        resolve();
                    }
                });
                child.on('error', (msg) => {
                    reject(new Error(`Got error from child: ${msg}`));
                });
            });
        })
        .then(() => {
            return requestAsync('http://localhost:' + freePort);
        })
        .then((response) => {
            expect(response.statusCode).equals(200);
            expect(response.body).equals(html);
        })
        .then(() => {
            child.on('close', (code) => {
                done();
            });
            child.kill('SIGKILL');
        });
    });
});
