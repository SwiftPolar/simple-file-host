/*
 * START of Configuration
 * */
var config = {
    port: 1337,
    filesContextPath: '/files',
    filesPhysicalPath: __dirname + '/uploads', //use absolute path to ensure that directory is correct
    uploadSizeLimit: '1mb',
    headers: { //header keys for request object to come in
        fileName: 'File-Name', //what to save the file name as
        apiKey: 'Api-Key', //what is the field to put api key in
    }
};
/*
 * END of Configuration
 * */

var express = require('express'),
    fs = require('fs'),
    bodyParser = require('body-parser'),
    fileType = require('file-type'),
    secret = require('./secret');

var rawBodySaver = function (req, res, buf, encoding) {
    if (buf && buf.length) {
        req.rawBody = buf;
    }
};

var app = express();

/*
 * Setup
 * */
app.use(config.filesContextPath, express.static(config.filesPhysicalPath));
app.disable('x-powered-by');

var rawParser = bodyParser.raw({
    limit: config.uploadSizeLimit,
    verify: rawBodySaver,
    type: function () {
        return true;
    }
});

var response = function (res, status, result) {
    res.json({
        'status': status,
        'result': result
    });
};

var authenticate = function (req, res, next) {
    var reqKey = req.get(config.headers.apiKey);
    (reqKey && reqKey === secret.apiKey) ? next()
        : response(res, 'error', '401 unauthorized');
};

app.post('/upload', authenticate, rawParser, function (req, res) {
    var uploadType = fileType(req.rawBody);
    var fileName = req.get(config.headers.fileName);
    var saveAs = fileName + '.' + uploadType.ext;
    fs.writeFile(config.filesPhysicalPath + '/' + saveAs, req.rawBody, function (err) {

        if (err) throw err;

        res.send('SUCCESS!');
    });
});

app.get('/', function (req, res) {
    res.send('Hello World!');
});

app.listen(config.port, function () {
    console.log("Very simple file server is now listing on port: " + config.port);
});