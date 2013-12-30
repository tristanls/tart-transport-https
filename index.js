/*

index.js - "tart-transport-https": Tart HTTPS transport

The MIT License (MIT)

Copyright (c) 2013 Dale Schumacher, Tristan Slominski

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

*/
"use strict";

var https = require('https');
var url = require('url');

var transport = module.exports;

transport.sendBeh = function sendBeh(message) {
    if (!message.address) {
        if (message.fail) {
            message.fail(new Error("Missing address"));
        }
        return;
    }
    
    var parsed = url.parse(message.address);
    if (parsed.protocol !== 'https:') {
        if (message.fail) {
            message.fail(new Error("Invalid protocol " + parsed.protocol));
        }
        return;
    }

    if (!parsed.hostname) {
        if (message.fail) {
            message.fail(new Error("Missing host"));
        }
        return;
    }

    if (!parsed.port) {
        if (message.fail) {
            message.fail(new Error("Missing port"));
        }
        return;
    }

    var options = {};
    var keys = ['pfx', 'key', 'passphrase', 'cert', 'ca', 'rejectUnauthorized',
        'NPNProtocols', 'servername', 'secureProtocol'];
    keys.forEach(function (key) {
        if (typeof message[key] !== 'undefined') {
            options[key] = message[key];
        }
    });
    options.host = parsed.hostname;
    options.port = parsed.port;
    options.path = parsed.path + parsed.hash,
    options.headers = {'Transfer-Encoding': 'chunked'};
    options.method = 'POST';    

    var req = https.request(options);

    req.on('response', function (res) {
        // drain all data
        res.on('data', function () {});

        if (res.statusCode == 200) {
            message.ok && message.ok();
            return;
        }

        message.fail && message.fail(new Error(res.statusCode));
    });

    req.on('error', function (error) {
        message.fail && message.fail(error);
    });

    req.end(message.content);
};

transport.sendWithOptions = function sendWithOptions(httpsOptions) {
    return function sendWithOptionsBeh(message) {
        Object.keys(httpsOptions).forEach(function (key) {
            message[key] = httpsOptions[key];
        });
        transport.sendBeh.call(this, message);
    }
};

transport.server = function server(receptionist) {
    var _server;

    var closeBeh = function closeBeh(ack) {
        if (!_server) {
            return; // do nothing if not listening
        }

        _server.on('close', function () {
            ack && typeof ack === 'function' && ack();
            _server = null;
        });
        _server.close();
    };

    var listenBeh = function listenBeh(message) {
        if (_server) {
            return; // do nothing if already listening
        }

        var options = {};
        var keys = ['pfx', 'key', 'passphrase', 'cert', 'ca', 'crl', 'ciphers',
            'handshakeTimeout', 'honorCipherOrder', 'requestCert', 
            'rejectUnauthorized', 'NPNProtocols', 'sessionIdContext', 
            'secureProtocol'];
        keys.forEach(function (key) {
            if (typeof message[key] !== 'undefined') {
                options[key] = message[key];
            }
        });        

        _server = https.createServer(options);
        _server.on('request', function (req, res) {
            if (req.method !== 'POST') {
                res.writeHead(400);
                res.end();
                return;
            }

            var data = "";
            req.on('data', function (chunk) {
                data += chunk.toString('utf8');
            });
            req.on('end', function () {
                receptionist({
                    address: 'https://' + message.host + ':' + message.port +
                        req.url,
                    content: data
                });

                res.writeHead(200);
                res.end();
            });
        });
        _server.on('listening', function () {
            message.ok && message.ok({host: message.host, port: message.port});
        });
        _server.on('error', function (error) {
            message.fail && message.fail(error);
        });
        _server.listen(message.port, message.host);
    };

    return {
        closeBeh: closeBeh,
        listenBeh: listenBeh
    };
};