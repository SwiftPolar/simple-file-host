/*
 * START of Configuration
 * */
var config = {
    port: 1337,
    filesContextPath: '/files',
    filesPhysicalPath: __dirname + '/uploads', //use absolute path to ensure that directory is correct
    uploadSizeLimit: '1mb',
    hashAlgo: 'sha256', //hash algo to use when calculating checksum for file
    headers: { //header keys for request object to come in
        fileName: 'File-Name', //what to save the file name as
        apiKey: 'Api-Key', //what is the field to put api key in
        checksum: 'Checksum', //field for file checksum
        folder: 'Folder', //folder to place file within root upload path [*Optional]
    }
};
/*
 * END of Configuration
 * */

var express = require('express'),
    fs = require('fs'),
    bodyParser = require('body-parser'),
    fileType = require('file-type'),
    secret = require('./secret'),
    crypto = require('crypto');

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

var validateHeaders = function (req, res, next) { //check for any missing headers
    var valid = true;
    var errors = [];
    var headers = config.headers;
    Object.keys(headers).map(function (key) {
        var header = headers[key];
        var check = req.get(header);
        if (!check && key !== 'folder') { //we allow for folder field to be blank
            valid = false;
            errors.push("400 Missing header " + header);
        }
    });

    valid ? next() : response(res, 'error', errors);
};

var authenticate = function (req, res, next) {
    var reqKey = req.get(config.headers.apiKey);
    (reqKey && reqKey === secret.apiKey) ? next()
        : response(res, 'error', '401 Unauthorized');
};

var directoryExists = function (directory) {
    var directoryPath = config.filesPhysicalPath + "/" + directory;
    try {
        fs.statSync(directoryPath);
    } catch (err) {
        fs.mkdirSync(directoryPath);
    }
};

app.post('/upload', validateHeaders, authenticate, rawParser, function (req, res, next) {
    var raw = req.rawBody;
    if (!raw) { //no file attached to the body
        return response(res, 'error', '400 Bad Request');
    }

    var headers = config.headers;
    //check to see if checksum matches i.e. file transfer successful
    var hash = crypto.createHash(config.hashAlgo);
    hash.update(raw);
    var hashResult = hash.digest('hex');
    if (hashResult !== req.get(headers.checksum)) {
        return response(res, 'error', '400 Checksum not matched');
    }

    var folder = req.get(headers.folder);
    !folder ? folder = ''
        : directoryExists(folder);

    var uploadType = fileType(raw);
    var fileName = req.get(headers.fileName);
    var saveAs = fileName + '.' + uploadType.ext;
    var savePath = (folder === '') ? config.filesPhysicalPath + '/' + saveAs
        : config.filesPhysicalPath + '/' + folder + '/' + saveAs;

    fs.writeFile(savePath, raw, function (err) {
        if (err) {
            return response(res, 'error', '500 Internal Server Error');
        }
        var httpResult = (folder === '')
            ? req.protocol + '://' + req.get('host') + config.filesContextPath + '/' + saveAs
            : req.protocol + '://' + req.get('host') + config.filesContextPath + '/' + folder + '/' + saveAs;
        response(res, 'success', httpResult)
    });
});

app.get('/', function (req, res) {
    res.send('Hello World!');
});

app.listen(config.port, function () {
    console.log("Very simple file server is now listing on port: " + config.port);
});