var config = {
    port: 1337,
    behindProxy: true, //set to true if using behind a proxy e.g. nginx, apache etc.
    https: {
        enabled: true, //set to true if you're using a SSL cert
        key: '', //path to private key file
        cert: '', //path to full chain file
        ca: '' //path to chain file
    },
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
    https = require('https'),
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

if (config.behindProxy) {
    //You might need to configure this if you're using a more advanced setup
    app.set('trust proxy', true);
    app.set('trust proxy', 'loopback');
}

if (config.https.enabled) {
    var ssl = {
        key: fs.readFileSync(config.https.key),
        cert: fs.readFileSync(config.https.cert),
        ca: fs.readFileSync(config.https.ca),
    };
    https.createServer(ssl, app).listen(config.port, function () {
        console.log("Very simple file server (SSL enabled) is now listing on port: " + config.port);
    });
} else {
    app.listen(config.port, function () {
        console.log("Very simple file server is now listing on port: " + config.port);
    });
}
