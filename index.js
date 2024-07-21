global._base = __dirname + '/';
global._viewPath = __dirname + '/resources/views/';

// App
const fs = require('fs');
const compression = require('compression');
const express = require('express');
var https = require('https');
var privateKey  = fs.readFileSync('selfsigned.key', 'utf8');
var certificate = fs.readFileSync('selfsigned.crt', 'utf8');
var credentials = {key: privateKey, cert: certificate};
var bodyParser = require('body-parser');


// default module
const app = express();

app.use(compression());

// dotenv
require('dotenv').config();

// helmet
require('./app/config/helmet')(app);

// express.Router();

app.set('trust proxy', 1)

const config = require('./app/config/config');

// Add headers to fix CORS issue
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', true);

    next();
});


// load public folder, static files serve first
// app.use('/resources', express.static('resources', {
//   maxAge: config.media_cache_age
// }));
app.use('/resources', express.static('resources'));

// let dir = './media';
// if (!fs.existsSync(dir)) {
//   fs.mkdirSync(dir);
// }

// app.use('/media', express.static('media', {
//   maxAge: config.media_cache_age
// }))

// view engine
// require('./app/config/liquidjs')(app);
app.set('view engine', 'ejs');


// parse body json
app.use(express.urlencoded({ extended: true }));
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; 
  },
}));

// upload files
const fileUpload = require('express-fileupload');
app.use(fileUpload({
  useTempFiles : true,
  tempFileDir : '/tmp/',
  uriDecodeFileNames: true,
}));

// MongoDB & session
require('./app/config/mongodb')(app);

// Google Cloud storage
// require('./app/config/cloud-storage')(app);

// share config
app.use(function(req, res, next) {
  config.base_url = req.protocol + '://' + req.get('host') + '/';
  
  req.config = config;

  res.view = {
    base_url: config.base_url,
    project_title: config.project_title,
    cdn_version: process.env.cdn_version,
  };

  res.view.toasts = req.session.toasts;
  req.session.toasts = [];

  next();
});

// routes
app.use('/static',express.static(_base + 'client/build/static'));
app.use('/', require('./app/config/routes'));

const PORT = process.env.PORT || config.port;

// app.listen(PORT, () => {
//   console.log('Running on ' + PORT + ' mode: ' + process.env.mode);
// });

if (process.env.mode == 'dev') {
  console.log('dev server', PORT, process.env.mode);
  var httpsServer = https.createServer(credentials, app);
  httpsServer.listen(PORT);
  // app.listen(PORT, () => {
  //   console.log('Running on ' + PORT + ' mode: ' + process.env.mode);
  // });
} else {
  console.log('production server', process.env.mode);
  app.listen(PORT, () => {
    console.log('Running on ' + PORT + ' mode: ' + process.env.mode);
  });
}